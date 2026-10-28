import type { Detection, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { VisionModels } from '../models/vision-models';
import type { FaceFrame, FaceTracking, FrameContext } from '../types';
import { FaceMotionTracker } from './face-motion-tracker';
import { classifyFaceMotion } from './face-motion-policy';

export interface FaceTrackingRequest {
  kind: 'none' | 'bounds' | 'beauty' | '3d';
  tracking?: FaceTracking;
  /** 3D 的常态关键点频率；明显运动时可以短时提升到 30Hz。 */
  landmarksFps?: 10 | 15 | 20 | 30;
  motionBoost?: boolean;
  experimentalInterFrameTracking?: boolean;
}

export interface FaceTrackingSnapshot {
  /** 包装当前视频帧；调度器内部只缓存检测数据，不保存这个对象。 */
  face: FaceFrame;
  detectorRan: boolean;
  landmarkerRan: boolean;
  /** 本帧实际推理耗时；使用缓存时为 0。 */
  inferenceMs: number;
  ageMs: number;
  /** 新检测结果或缓存失效时递增，包含未检出人脸的结果。 */
  version: number;
  trackedAtMs: number | undefined;
  /** 网格最近一次图像观测更新时间；模型年龄仍由 trackedAtMs / ageMs 表达。 */
  updatedAtMs?: number;
  intervalMs: number;
  motionMs?: number;
  motionTracked?: boolean;
  motionConfidence?: number;
  motionFallback?: boolean;
  motionUnavailable?: boolean;
  motionBoosted?: boolean;
}

const NO_FACE_INTERVAL_MS = 250;
const DISCONTINUITY_MS = 250;
const MOTION_BOOST_MS = 300;
const RECOVERY_MS = 200;
type MotionTracker = Pick<FaceMotionTracker, 'seed' | 'track' | 'reset' | 'destroy'>;

/** 调度单一路人脸跟踪需求的节拍、缓存和统计；轻量美白可共用贴纸跟踪，网格美白按需独立调度。 */
export class FaceTrackingScheduler {
  private requestKey: string | null = null;
  private width = 0;
  private height = 0;
  private lastFrameTime = -Infinity;
  private trackedAt: number | undefined;
  private nextTime = -Infinity;
  private interval = 0;
  private detections: Detection[] = [];
  private landmarks: FaceLandmarkerResult | null = null;
  private misses = 0;
  private inferenceAverage = 0;
  private boostUntil = -Infinity;
  private version = 0;
  private revision = 0;
  private displayLandmarks: FaceLandmarkerResult | null = null;
  private displayAt: number | undefined;
  private motionReady = false;
  private motionDisabled = false;
  private motionRetryAt = -Infinity;
  private recoveryUntil = -Infinity;
  private costlyMotionCalls = { seed: 0, track: 0 };
  private motionStats: Partial<FaceTrackingSnapshot> = {};

  constructor(
    private models: Pick<VisionModels, 'trackFace'>,
    private motion: MotionTracker = new FaceMotionTracker()
  ) {}

  public track(frame: FrameContext, request: FaceTrackingRequest): FaceTrackingSnapshot {
    const time = Number.isFinite(frame.videoFrame.timestamp) ? frame.videoFrame.timestamp / 1000 : frame.timestamp;
    const tracking = this.resolveTracking(request);
    const normalInterval = this.normalInterval(request);
    const capabilities =
      tracking?.mode === 'landmarks' ? `${!!tracking.blendshapes}/${tracking.transformationMatrixes !== false}` : '';
    const key = `${request.kind}/${normalInterval}/${capabilities}/${
      request.motionBoost !== false
    }/${!!request.experimentalInterFrameTracking}`;
    if (
      key !== this.requestKey ||
      frame.width !== this.width ||
      frame.height !== this.height ||
      time < this.lastFrameTime ||
      time - this.lastFrameTime > DISCONTINUITY_MS
    ) {
      this.reset();
      this.requestKey = key;
      this.width = frame.width;
      this.height = frame.height;
      this.interval = normalInterval;
    }
    this.lastFrameTime = time;
    const motionRequested = request.kind === '3d' && !!request.experimentalInterFrameTracking;
    // 平面依赖姿态矩阵，其他消费者可能依赖表情系数；不能仅更新 mesh 而沿用不一致的输出。
    const motionEligible =
      motionRequested &&
      tracking?.mode === 'landmarks' &&
      tracking.transformationMatrixes === false &&
      !tracking.blendshapes;
    this.motionStats = {
      motionMs: 0,
      motionTracked: false,
      motionFallback: false,
      motionUnavailable: motionRequested && (!motionEligible || this.motionDisabled || time < this.motionRetryAt),
      motionBoosted: request.kind === '3d' && this.interval < normalInterval
    };
    if (!tracking) return this.snapshot(frame, time);
    if (time + 1 < this.nextTime) {
      if (!motionEligible || !this.motionReady || this.motionDisabled || time < this.recoveryUntil) {
        return this.snapshot(frame, time);
      }
      const started = performance.now();
      let result: ReturnType<MotionTracker['track']>;
      try {
        result = this.motion.track(frame);
      } catch {
        result = { landmarks: null, confidence: 0 };
      }
      this.recordMotionCost(Math.max(0, performance.now() - started), 'track');
      this.motionStats.motionConfidence = Number.isFinite(result.confidence) ? result.confidence : 0;
      if (result.landmarks && result.confidence > 0 && !this.motionDisabled) {
        this.displayLandmarks = result.landmarks;
        this.displayAt = time;
        this.version++;
        this.motionStats.motionTracked = true;
        return this.snapshot(frame, time);
      }
      // 在本帧恢复模型推理；短时全速更新避免遮挡、眼口变化被低频缓存掩盖。
      this.motionStats.motionFallback = true;
      this.motionReady = false;
      this.motion.reset();
      this.recoveryUntil = time + RECOVERY_MS;
      this.nextTime = time;
      this.displayLandmarks = null;
      this.displayAt = undefined;
      this.version++;
    }

    const revision = this.revision;
    const started = performance.now();
    let tracked: FaceFrame;
    try {
      tracked = this.models.trackFace(tracking, frame);
    } catch (error) {
      this.reset();
      throw error;
    }
    const inferenceMs = Math.max(0, performance.now() - started);
    // 模型调用目前同步；若调用期间被取消/重置，返回的数据仍不能重新激活效果。
    if (revision !== this.revision) return this.snapshot(frame, time, tracking.mode, inferenceMs);
    if (tracked.inferenceUnavailable) {
      // 配置期间不把“未执行”当作丢脸，也不推迟下一次尝试。旧脸只保留一个短窗口。
      const maxAge = Math.min(240, this.interval + 35);
      if (
        this.trackedAt !== undefined &&
        time - this.trackedAt > maxAge &&
        (this.landmarks || this.detections.length)
      ) {
        this.landmarks = null;
        this.displayLandmarks = null;
        this.displayAt = undefined;
        this.detections = [];
        this.boostUntil = -Infinity;
        this.motionReady = false;
        this.motion.reset();
        this.version++;
      }
      const snapshot = this.snapshot(frame, time);
      snapshot.face.inferenceUnavailable = true;
      return snapshot;
    }

    const points = tracked.landmarks?.faceLandmarks[0];
    const nextLandmarks = tracking.mode === 'landmarks' && points && points.length >= 468 ? tracked.landmarks : null;
    const nextDetections = tracking.mode === 'bounds' ? tracked.detections : [];
    const hasFace = nextDetections.length > 0 || nextLandmarks !== null;
    const movement =
      nextLandmarks && this.trackedAt !== undefined
        ? classifyFaceMotion(this.landmarks, nextLandmarks, time - this.trackedAt, frame.height / frame.width)
        : undefined;
    if (
      request.kind === '3d' &&
      request.motionBoost !== false &&
      movement &&
      (movement === 'deformation' || !motionEligible || !this.motionReady || this.motionDisabled)
    ) {
      this.boostUntil = time + (movement === 'deformation' ? 150 : MOTION_BOOST_MS);
    }
    if (!hasFace) {
      this.boostUntil = this.recoveryUntil = -Infinity;
      this.motionReady = false;
      this.motion.reset();
    } else if (
      motionEligible &&
      nextLandmarks &&
      !this.motionDisabled &&
      normalInterval > 1000 / 30 &&
      time >= this.motionRetryAt &&
      time >= this.recoveryUntil &&
      time >= this.boostUntil
    ) {
      const started = performance.now();
      try {
        this.motionReady = this.motion.seed(frame, nextLandmarks);
      } catch {
        this.motionReady = false;
      }
      this.recordMotionCost(Math.max(0, performance.now() - started), 'seed');
      if (!this.motionReady) {
        // 小脸、低纹理或画布不支持时避免逐帧尝试读回，期间恢复至少 20Hz 的常规定位。
        this.motionRetryAt = time + 1000;
        this.motionStats.motionUnavailable = true;
        this.motion.reset();
      }
    } else if (motionEligible) {
      // 升频期间已由完整模型更新；不再额外读图建立用不到的帧间参考。
      this.motionReady = false;
      this.motion.reset();
    }
    this.misses = hasFace ? 0 : this.misses + 1;
    this.inferenceAverage = this.inferenceAverage ? this.inferenceAverage * 0.75 + inferenceMs * 0.25 : inferenceMs;
    let interval = normalInterval;
    if (motionRequested && (!motionEligible || this.motionDisabled || time < this.motionRetryAt)) {
      interval = Math.min(interval, 50);
    }
    if (request.kind === 'beauty') {
      // 独立美白常态 8Hz，减轻高美白时检测框滞后造成的残影；慢设备最低 5Hz。
      interval = Math.max(interval, Math.min(200, this.inferenceAverage * 4));
      if (!hasFace) interval = NO_FACE_INTERVAL_MS;
    } else if (this.misses >= 2) {
      interval = NO_FACE_INTERVAL_MS;
    } else if (request.kind === '3d' && hasFace && (time < this.boostUntil || time < this.recoveryUntil)) {
      interval = 1000 / 30;
    }
    this.nextTime =
      this.trackedAt !== undefined && interval === this.interval
        ? this.nextTime + Math.max(1, Math.floor((time - this.nextTime) / interval) + 1) * interval
        : time + interval;
    this.interval = interval;
    this.trackedAt = time;
    this.detections = nextDetections;
    this.landmarks = nextLandmarks;
    this.displayLandmarks = nextLandmarks;
    this.displayAt = time;
    this.motionStats.motionBoosted = request.kind === '3d' && interval < normalInterval;
    this.version++;
    return this.snapshot(frame, time, tracking.mode, inferenceMs);
  }

  /** 暂停、效果切换和销毁时立即失效；模型及其资源仍由 VisionModels 管理。 */
  public reset() {
    this.revision++;
    this.version++;
    this.requestKey = null;
    this.width = this.height = 0;
    this.lastFrameTime = this.nextTime = -Infinity;
    this.trackedAt = undefined;
    this.interval = 0;
    this.detections = [];
    this.landmarks = null;
    this.misses = 0;
    this.inferenceAverage = 0;
    this.boostUntil = -Infinity;
    this.displayLandmarks = null;
    this.displayAt = undefined;
    this.motionReady = this.motionDisabled = false;
    this.motionRetryAt = this.recoveryUntil = -Infinity;
    this.costlyMotionCalls = { seed: 0, track: 0 };
    this.motionStats = {};
    this.motion.reset();
  }

  public destroy() {
    this.reset();
    this.motion.destroy();
  }

  private resolveTracking(request: FaceTrackingRequest): FaceTracking | null {
    if (request.kind === 'none') return null;
    if (request.kind === 'bounds') return { mode: 'bounds' };
    if (request.tracking?.mode === 'bounds') return request.tracking;
    return request.tracking?.mode === 'landmarks'
      ? request.tracking
      : { mode: 'landmarks', transformationMatrixes: request.kind === '3d' };
  }

  private normalInterval(request: FaceTrackingRequest) {
    if (request.kind === 'none') return 0;
    if (request.kind === 'beauty') return 1000 / 8;
    if (request.kind === '3d') {
      const fps = request.landmarksFps ?? 20;
      if (![10, 15, 20, 30].includes(fps)) throw new Error('3D 人脸跟踪频率仅支持 10、15、20 或 30Hz');
      return 1000 / fps;
    }
    return 1000 / 15;
  }

  private recordMotionCost(ms: number, kind: 'seed' | 'track') {
    this.motionStats.motionMs = (this.motionStats.motionMs ?? 0) + ms;
    // 同步 GPU 等待不等于 CPU 计算，不能用推理墙钟的很小比例判断净收益。
    // 此处只保护单帧预算：不超过一次推理或约 1/3 个 30fps 帧，保留 4ms 计时容忍。
    const budget = Math.max(4, Math.min(12, this.inferenceAverage || 12));
    this.costlyMotionCalls[kind] = ms > budget ? this.costlyMotionCalls[kind] + 1 : 0;
    if (this.costlyMotionCalls[kind] >= 4) {
      this.motionDisabled = true;
      this.motionReady = false;
      this.motionStats.motionUnavailable = true;
      this.motion.reset();
    }
  }

  private snapshot(
    frame: FrameContext,
    time: number,
    ran?: FaceTracking['mode'],
    inferenceMs = 0
  ): FaceTrackingSnapshot {
    return {
      face: {
        ...frame,
        detections: this.detections,
        landmarks: this.displayLandmarks,
        detectionTimestamp: this.displayAt
      },
      detectorRan: ran === 'bounds',
      landmarkerRan: ran === 'landmarks',
      inferenceMs,
      ageMs: this.trackedAt === undefined ? 0 : Math.max(0, time - this.trackedAt),
      version: this.version,
      trackedAtMs: this.trackedAt,
      updatedAtMs: this.displayAt,
      intervalMs: this.interval,
      ...this.motionStats
    };
  }
}
