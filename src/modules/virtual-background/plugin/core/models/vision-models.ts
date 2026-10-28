import { FaceDetector, FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { IVideoProcessorConfig } from '../../type';
import type { FaceFrame, FaceTracking, FrameContext, GpuMaskTarget, GpuSegmentationMask } from '../types';
import { FaceDetectionInputAdapter, type FaceDetectionInput } from './face-detection-input';

interface ModelCache {
  getCacheModel(): { imageSegmenter?: ImageSegmenter; faceDetector?: FaceDetector };
  setCacheModel(models: { imageSegmenter?: ImageSegmenter; faceDetector?: FaceDetector }): void;
}

/** 模型路径、按需加载、推理时间及模型所有权集中管理。 */
export class VisionModels {
  private imageSegmenter: ImageSegmenter | null;
  private faceDetector: FaceDetector | null;
  private faceLandmarker: FaceLandmarker | null = null;
  private segmenterLoading: Promise<void> | null = null;
  private detectorLoading: Promise<void> | null = null;
  private landmarkerLoading: Promise<void> | null = null;
  private wantsLandmarker = false;
  private pendingFaceRequirements = new Map<symbol, FaceTracking>();
  private wantsBlendshapes = false;
  private hasBlendshapes = false;
  private wantsMatrices = false;
  private hasMatrices = false;
  private lastFaceTimestamps = { bounds: -1, landmarks: -1 };
  private lastMaskTimestamp = -1;
  private destroyed = false;
  private modelPath = '';
  private faceInputs: Record<FaceTracking['mode'], FaceDetectionInputAdapter>;
  private inferenceCount = 0;

  /**
   * 接入模型配置和共享缓存；构造时不发起模型下载。
   *
   * @param { IVideoProcessorConfig } config - 模型目录及可选的外部模型实例。
   * @param { ModelCache } cache - Extension 提供的分割和人脸检测模型缓存，不缓存逐流跟踪的 Landmarker。
   */
  constructor(private config: IVideoProcessorConfig, private cache: ModelCache, private gpuMaskTarget?: GpuMaskTarget) {
    this.imageSegmenter = null;
    this.faceDetector = config.faceDetector ?? null;
    // 两个模型的脸宽与原图复检节拍独立，美白不能改变 2D 检测器的输入选择。
    this.faceInputs = {
      bounds: new FaceDetectionInputAdapter(config.faceTracking?.maxDimension),
      landmarks: new FaceDetectionInputAdapter(config.faceTracking?.maxDimension)
    };
    this.init();
  }

  /** 规范化模型根目录，移除末尾斜杠；不加载模型。 */
  public init() {
    this.modelPath = (this.config.modelPath ?? '').replace(/\/$/, '');
  }

  /** 仅用于帧边界的轻量配置提交；后端和分割输出格式改变时必须创建新的管理器。 */
  public updateRuntimeConfig(config: IVideoProcessorConfig) {
    this.assertActive();
    if (config.faceTracking?.maxDimension !== this.config.faceTracking?.maxDimension) {
      this.faceInputs.bounds.destroy();
      this.faceInputs.landmarks.destroy();
      this.faceInputs = {
        bounds: new FaceDetectionInputAdapter(config.faceTracking?.maxDimension),
        landmarks: new FaceDetectionInputAdapter(config.faceTracking?.maxDimension)
      };
    }
    this.config = config;
  }

  /**
   * 获取兼容旧接口的模型引用，不包含渲染后端等处理器配置。
   *
   * @returns 当前 vision、分割模型和人脸检测模型；未提供或未加载的项为 null。
   */
  public getConfig() {
    return { vision: this.config.vision ?? null, imageSegmenter: this.imageSegmenter, faceDetector: this.faceDetector };
  }

  /**
   * 预加载背景分割和 2D 人脸检测模型；3D 关键点模型仍按需加载。
   *
   * @returns { Promise<boolean> } - 两类模型就绪后返回 true。
   * @throws 加载失败时抛出含 code、detail 和 msg 的错误对象。
   */
  public async preload() {
    try {
      await this.prepareSegmenter();
      await this.prepareFace({ mode: 'bounds' });
      return true;
    } catch (error) {
      throw { code: 500, detail: error, msg: '模型加载失败' };
    }
  }

  /**
   * 复用已有分割模型，或加载并写入共享缓存；同一管理器内合并并发加载。
   *
   * @returns { Promise<void> } - 模型就绪后完成；加载失败或管理器销毁时拒绝。
   */
  public async prepareSegmenter() {
    this.assertActive();
    if (!this.gpuMaskTarget) throw new Error('GPU 纹理直用缺少共享画布');
    if (this.config.imageSegmenter) throw new Error('纹理直用不支持外部分割模型');
    if (this.imageSegmenter) return;
    const canvas = this.gpuMaskTarget.canvas;
    this.segmenterLoading ??= ImageSegmenter.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: `${this.modelPath}/xylink_segmenter.tflite`, delegate: 'GPU' },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
      canvas,
      runningMode: 'VIDEO'
    })
      .then((model) => {
        if (this.destroyed) model.close();
        else {
          if (model.getLabels()[0]?.toLowerCase() !== 'selfie') {
            model.close();
            throw new Error('纹理直用需要 selfie_segmenter 的前景概率通道');
          }
          this.imageSegmenter = model;
        }
      })
      .catch((error) => {
        throw { code: 500, detail: error, msg: '模型加载失败' };
      })
      .finally(() => {
        this.segmenterLoading = null;
      });
    await this.segmenterLoading;
    this.assertActive();
  }

  /**
   * 根据跟踪需求准备人脸模型；关键点模型归当前管理器独占，表情系数按需开启。
   *
   * @param { FaceTracking } tracking - bounds 使用检测框；landmarks 使用关键点、姿态及可选表情系数。
   * @returns { Promise<void> } - 所需模型与输出能力就绪后完成；加载失败或销毁时拒绝。
   */
  public async prepareFace(tracking: FaceTracking) {
    this.assertActive();
    if (tracking.mode === 'bounds') {
      await this.prepareDetector();
      return;
    }
    this.wantsLandmarker = true;
    this.wantsBlendshapes ||= !!tracking.blendshapes;
    // 旧效果默认需要姿态矩阵；仅美白显式关闭 Face Geometry 输出，避免无用计算。
    this.wantsMatrices ||= tracking.transformationMatrixes !== false;
    await this.synchronizeLandmarker();
  }

  /** 效果切换提交后汇总活跃消费者需求；预加载可升级，提交时才关闭不再使用的输出。 */
  public async syncFaceRequirements(tracking: FaceTracking | null) {
    this.assertActive();
    this.wantsLandmarker = tracking?.mode === 'landmarks';
    this.wantsBlendshapes = tracking?.mode === 'landmarks' && !!tracking.blendshapes;
    this.wantsMatrices = tracking?.mode === 'landmarks' && tracking.transformationMatrixes !== false;
    await this.synchronizeLandmarker();
  }

  /** 候选效果从准备到提交持有能力；释放只移除租约，由提交后的 sync 统一收敛。 */
  public holdFaceRequirements(tracking: FaceTracking): () => void {
    this.assertActive();
    const token = Symbol();
    if (tracking.mode === 'landmarks') this.pendingFaceRequirements.set(token, { ...tracking });
    return () => {
      this.pendingFaceRequirements.delete(token);
    };
  }

  /** 检查已应用能力是否仍覆盖当前效果，供提交后非必要降级失败时保留可用效果。 */
  public supportsFaceRequirements(tracking: FaceTracking | null): boolean {
    if (!tracking) return true;
    if (this.destroyed) return false;
    if (tracking.mode === 'bounds') return !!this.faceDetector;
    return (
      !!this.faceLandmarker &&
      !this.landmarkerLoading &&
      (!tracking.blendshapes || this.hasBlendshapes) &&
      (tracking.transformationMatrixes === false || this.hasMatrices)
    );
  }

  /** 实际模型调用次数，包含缩图失败后的原帧重试，供处理器按帧计算差值。 */
  public get faceInferenceCount() {
    return this.inferenceCount;
  }

  /**
   * 执行一次人脸推理，并为模型保持严格递增的毫秒时间戳。
   *
   * @param { FaceTracking } tracking - 与已准备模型一致的跟踪模式。
   * @param { FrameContext } frame - 待推理的视频帧及其尺寸、时间信息；不转移视频帧所有权。
   * @returns { FaceFrame } - 附带检测结果的帧上下文；模型未就绪时对应结果为空。
   */
  public trackFace(tracking: FaceTracking, frame: FrameContext): FaceFrame {
    const result: FaceFrame = { ...frame, detections: [], landmarks: null };
    if (
      this.destroyed ||
      (tracking.mode === 'bounds' ? !this.faceDetector : !this.faceLandmarker || this.landmarkerLoading)
    )
      return { ...result, inferenceUnavailable: true };
    const faceInput = this.faceInputs[tracking.mode];
    const detect = (input: FaceDetectionInput) => {
      const timestamp = Math.max(frame.timestamp, this.lastFaceTimestamps[tracking.mode] + 1);
      this.lastFaceTimestamps[tracking.mode] = timestamp;
      this.inferenceCount++;
      if (tracking.mode === 'bounds') {
        result.detections = faceInput.mapDetections(
          this.faceDetector!.detectForVideo(input.source, timestamp).detections,
          input
        );
      } else {
        result.landmarks = this.faceLandmarker!.detectForVideo(input.source, timestamp);
      }
    };
    const input = faceInput.prepare(frame);
    detect(input);
    if (faceInput.observe(result, input)) {
      const original = faceInput.original(frame);
      detect(original);
      faceInput.observe(result, original);
    }
    return result;
  }

  /** 原帧交给共享 WebGL 模型；GPU 结果仅在回调内借用并保存到合成器自有纹理。 */
  public segmentGpu(frame: FrameContext): GpuSegmentationMask | null {
    if (!this.imageSegmenter) return null;
    const target = this.gpuMaskTarget;
    if (!target) throw new Error('GPU 纹理直用缺少共享画布');
    const maxDimension = this.config.experimentalPerformance?.segmentationMaxDimension ?? 256;
    const scale = Math.min(1, maxDimension / Math.max(frame.width, frame.height));
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    this.lastMaskTimestamp = Math.max(frame.timestamp, this.lastMaskTimestamp + 1);
    let mask: GpuSegmentationMask | null = null;
    // 1.0.1 会将共享画布调整到输入尺寸，使用原帧避免每次推理反复缩放输出画布。
    this.imageSegmenter.segmentForVideo(frame.videoFrame, this.lastMaskTimestamp, (result) => {
      const confidence = result.confidenceMasks?.[0];
      if (!confidence?.hasWebGLTexture() || confidence.canvas !== target.canvas) {
        throw new Error('当前 MediaPipe 未返回共享上下文的 GPU mask');
      }
      if (target.canvas.width !== frame.width || target.canvas.height !== frame.height) {
        throw new Error('共享 WebGL 画布尺寸与原帧不一致');
      }
      target.updateMask(confidence.getAsWebGLTexture(), frame, width, height);
      mask = { kind: 'gpu', width, height, format: 'foreground-alpha' };
    });
    return mask;
  }

  /** 关闭独占关键点和分割模型；不关闭 Extension 共享的人脸检测模型。 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pendingFaceRequirements.clear();
    const landmarker = this.faceLandmarker;
    if (landmarker) {
      // setOptions 尚在使用 WASM 时不能提前 close；不允许新推理或新配置进入。
      if (this.landmarkerLoading)
        this.landmarkerLoading.then(
          () => landmarker.close(),
          () => landmarker.close()
        );
      else landmarker.close();
    }
    this.faceLandmarker = null;
    this.faceInputs.bounds.destroy();
    this.faceInputs.landmarks.destroy();
    // 人脸检测沿用 Extension 的共享缓存，不在单个处理器中关闭借用的实例。
    this.imageSegmenter?.close();
    this.imageSegmenter = null;
    this.faceDetector = null;
  }

  /** 加载或复用人脸检测模型，合并本管理器内的并发请求；销毁后晚到的实例立即关闭。 */
  private async prepareDetector() {
    this.faceDetector ??= this.cache.getCacheModel().faceDetector ?? null;
    if (this.faceDetector) return;
    this.detectorLoading ??= FaceDetector.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: `${this.modelPath}/xylink_face.tflite`, delegate: 'GPU' },
      runningMode: 'VIDEO'
    })
      .then((model) => {
        if (this.destroyed) model.close();
        else {
          this.faceDetector = model;
          this.cache.setCacheModel({ faceDetector: model });
        }
      })
      .catch((error) => {
        throw { code: 500, detail: error, msg: '模型加载失败' };
      })
      .finally(() => {
        this.detectorLoading = null;
      });
    await this.detectorLoading;
    this.assertActive();
  }

  private async synchronizeLandmarker() {
    while (true) {
      const requirements = this.faceRequirements;
      const matches = this.faceLandmarker
        ? requirements.blendshapes === this.hasBlendshapes && requirements.matrices === this.hasMatrices
        : !requirements.landmarker;
      if (!this.landmarkerLoading && matches) return;
      this.landmarkerLoading ??= this.prepareLandmarker().finally(() => {
        this.landmarkerLoading = null;
      });
      await this.landmarkerLoading;
      this.assertActive();
    }
  }

  private get faceRequirements() {
    let landmarker = this.wantsLandmarker;
    let blendshapes = this.wantsBlendshapes;
    let matrices = this.wantsMatrices;
    for (const requirement of this.pendingFaceRequirements.values()) {
      if (requirement.mode !== 'landmarks') continue;
      landmarker = true;
      blendshapes ||= !!requirement.blendshapes;
      matrices ||= requirement.transformationMatrixes !== false;
    }
    return { landmarker, blendshapes, matrices };
  }

  /** 串行应用一次需求快照；等待期间的新需求由外层循环继续收敛，不重复合并旧请求。 */
  private async prepareLandmarker() {
    try {
      const { blendshapes, matrices } = this.faceRequirements;
      if (this.faceLandmarker) {
        const model = this.faceLandmarker;
        try {
          await model.setOptions({
            ...(blendshapes !== this.hasBlendshapes ? { outputFaceBlendshapes: blendshapes } : {}),
            ...(matrices !== this.hasMatrices ? { outputFacialTransformationMatrixes: matrices } : {})
          });
        } catch (error) {
          this.assertActive();
          // MediaPipe 不承诺 setOptions 原子性；失败时恢复旧 graph 的完整能力组合。
          try {
            await model.setOptions({
              outputFaceBlendshapes: this.hasBlendshapes,
              outputFacialTransformationMatrixes: this.hasMatrices
            });
          } catch (restorationError) {
            this.assertActive();
            model.close();
            this.faceLandmarker = null;
            this.hasBlendshapes = this.hasMatrices = false;
            throw { configuration: error, restoration: restorationError };
          }
          throw error;
        }
        this.assertActive();
        this.hasBlendshapes = blendshapes;
        this.hasMatrices = matrices;
        return;
      }
      // VIDEO 跟踪状态不能跨视频流共享，Landmarker 由当前处理器独占。
      const model = await FaceLandmarker.createFromOptions(this.fileset, {
        baseOptions: { modelAssetPath: `${this.modelPath}/xylink_face_landmarker.task`, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: blendshapes,
        outputFacialTransformationMatrixes: matrices
      });
      if (this.destroyed) model.close();
      else {
        this.faceLandmarker = model;
        this.hasBlendshapes = blendshapes;
        this.hasMatrices = matrices;
      }
    } catch (error) {
      this.assertActive();
      throw { code: 500, detail: error, msg: '人脸关键点模型加载失败' };
    }
  }

  /** 按模型根目录生成配套 WASM 二进制和加载脚本地址。 */
  private get fileset() {
    return {
      wasmBinaryPath: `${this.modelPath}/xylink_vision.wasm`,
      wasmLoaderPath: `${this.modelPath}/xylink_vision.js`
    };
  }

  /** 阻止销毁后的模型加载或异步结果继续生效。 */
  private assertActive() {
    if (this.destroyed) throw new Error('模型管理器已销毁');
  }
}
