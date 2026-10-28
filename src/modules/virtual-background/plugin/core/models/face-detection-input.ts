import type { Detection } from '@mediapipe/tasks-vision';
import type { FaceFrame, FrameContext } from '../types';

const MIN_FACE_WIDTH = 192;
const SOURCE_REFRESH_MS = 1000;

export interface FaceDetectionInput {
  source: VideoFrame | OffscreenCanvas;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  resized: boolean;
}

/** 只缩放实际参与检测的帧；保留原视频与完整视野供高清合成。 */
export class FaceDetectionInputAdapter {
  private canvas: OffscreenCanvas | null = null;
  private context: OffscreenCanvasRenderingContext2D | null = null;
  private unavailable = false;
  private faceWidthRatio = 0;
  private width = 0;
  private height = 0;
  private lastTime = -Infinity;
  private lastSourceTime = -Infinity;

  constructor(private maxDimension: 480 | 640 | 'source' = 'source') {}

  public prepare(frame: FrameContext): FaceDetectionInput {
    const time = this.time(frame);
    if (frame.width !== this.width || frame.height !== this.height || time < this.lastTime) this.reset();
    this.width = frame.width;
    this.height = frame.height;
    this.lastTime = time;
    if (
      this.maxDimension === 'source' ||
      this.unavailable ||
      time - this.lastSourceTime >= SOURCE_REFRESH_MS ||
      !this.faceWidthRatio
    ) {
      return this.original(frame);
    }

    // 使用严格相同的宽高比，避免 plane 的姿态矩阵因四舍五入或 letterbox 改变投影。
    let divisor = frame.width;
    let remainder = frame.height;
    while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
    const unitWidth = frame.width / divisor;
    const unitHeight = frame.height / divisor;
    const multiple = Math.floor(this.maxDimension / Math.max(unitWidth, unitHeight));
    const width = unitWidth * multiple;
    const height = unitHeight * multiple;
    if (!multiple || width >= frame.width || this.faceWidthRatio * width < MIN_FACE_WIDTH) return this.original(frame);

    try {
      this.canvas ??= new OffscreenCanvas(width, height);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.context ??= this.canvas.getContext('2d');
      if (!this.context) throw new Error('无法创建人脸检测缩图画布');
      this.context.drawImage(frame.videoFrame, 0, 0, width, height);
      return {
        source: this.canvas,
        width,
        height,
        scaleX: frame.width / width,
        scaleY: frame.height / height,
        resized: true
      };
    } catch {
      // 缩图只是优化：浏览器不支持或输入不可绘制时继续用原帧。
      this.unavailable = true;
      return this.original(frame);
    }
  }

  public original(frame: FrameContext): FaceDetectionInput {
    this.lastSourceTime = this.time(frame);
    return { source: frame.videoFrame, width: frame.width, height: frame.height, scaleX: 1, scaleY: 1, resized: false };
  }

  /** 关键点与 keypoints 已归一化；只有检测框是输入像素坐标，需要还原。 */
  public mapDetections(detections: Detection[], input: FaceDetectionInput): Detection[] {
    if (!input.resized) return detections;
    return detections.map((detection) => ({
      ...detection,
      boundingBox: detection.boundingBox
        ? {
            ...detection.boundingBox,
            originX: detection.boundingBox.originX * input.scaleX,
            originY: detection.boundingBox.originY * input.scaleY,
            width: detection.boundingBox.width * input.scaleX,
            height: detection.boundingBox.height * input.scaleY
          }
        : undefined
    }));
  }

  /** 缩图后丢脸或脸变小，当次立即用原帧重试，避免低频调度进一步延长恢复。 */
  public observe(frame: FaceFrame, input: FaceDetectionInput): boolean {
    let minimum = Infinity;
    if (frame.landmarks) {
      for (const points of frame.landmarks.faceLandmarks) {
        if (points.length < 468) continue;
        let left = Infinity;
        let right = -Infinity;
        for (const point of points) {
          left = Math.min(left, point.x);
          right = Math.max(right, point.x);
        }
        const width = right - left;
        if (Number.isFinite(width) && width > 0) minimum = Math.min(minimum, width);
      }
    } else {
      for (const detection of frame.detections) {
        const width = (detection.boundingBox?.width ?? 0) / frame.width;
        if (Number.isFinite(width) && width > 0) minimum = Math.min(minimum, width);
      }
    }
    this.faceWidthRatio = Number.isFinite(minimum) ? minimum : 0;
    return input.resized && this.faceWidthRatio * input.width < MIN_FACE_WIDTH;
  }

  public reset() {
    this.faceWidthRatio = 0;
    this.lastTime = this.lastSourceTime = -Infinity;
  }

  public destroy() {
    this.reset();
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
    this.context = null;
  }

  private time(frame: FrameContext) {
    return Number.isFinite(frame.videoFrame.timestamp) ? frame.videoFrame.timestamp / 1000 : frame.timestamp;
  }
}
