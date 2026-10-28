/** 视频轨道调度入口；具体模型、素材和渲染均由对应模块负责。 */
import {
  type FaceEffectOptions,
  type IBackgroundOptions,
  type IBeautyOptions,
  type IProcessTrack,
  type IVideoProcessorConfig,
  type IVideoProcessorConfigPatch,
  type VideoPerformanceSample,
  type VirtualEffectOptions,
  VirtualKind
} from '../type';
import type { XYLinkVirtualExtension } from './extension';
import { BackgroundEffect } from './effects/background-effect';
import { FaceEffectController } from './effects/face-effect-controller';
import { BeautyController } from './effects/beauty-controller';
import { VisionModels } from './models/vision-models';
import { FaceMotionTracker } from './tracking/face-motion-tracker';
import {
  FaceTrackingScheduler,
  type FaceTrackingRequest,
  type FaceTrackingSnapshot
} from './tracking/face-tracking-scheduler';
import { createRenderer } from './renderers/create-renderer';
import { copyRuntimeConfig, mergeRuntimeConfig, validateBeautyOptions, validateRuntimeConfig } from './runtime-config';
import { connectVideoPipeline } from './track-pipeline';
import type {
  FaceTracking,
  FrameContext,
  FrameRenderer,
  FrameRenderOptions,
  GpuSegmentationMask,
  SegmentationMask
} from './types';

export class VideoProcessor {
  private models: VisionModels;
  private faceTracking: FaceTrackingScheduler;
  private background: BackgroundEffect;
  private sticky: FaceEffectController;
  private head: FaceEffectController;
  private beauty: BeautyController;
  private renderer: FrameRenderer;
  private enablePlugin = false;
  private destroyed = false;
  private trackWidth = 0;
  private trackHeight = 0;
  private trackGenerator: any = null;
  private outputSize: {
    width: number;
    height: number;
    listeners: Set<(size: { width: number; height: number }) => void>;
  } | null = null;
  private pipelineAbort: AbortController | null = null;
  private cachedMask: SegmentationMask | GpuSegmentationMask | null = null;
  private maskTimestampMs = -Infinity;
  private nextSegmentationMs = -Infinity;
  private maskSourceWidth = 0;
  private maskSourceHeight = 0;
  private activeFrames = 0;
  private frameBoundaryActions: Array<() => void> = [];
  private effectOperations = new Set<Promise<unknown>>();
  private effectRevision = 0;
  private beautyRevision = 0;
  private configUpdate: AbortController | null = null;

  /**
   * 创建模型、效果和帧合成模块；模型按需加载，视频管线由 process 启动。
   * @param { IVideoProcessorConfig } config - 模型目录、分割模糊强度及渲染后端配置。
   * @param { XYLinkVirtualExtension } pluginInstance - 所属插件实例，提供插件类型和共享模型缓存。
   */
  constructor(private config: IVideoProcessorConfig = {}, private pluginInstance: XYLinkVirtualExtension) {
    validateRuntimeConfig(config);
    this.config = copyRuntimeConfig(config);
    config = this.config;
    this.renderer = createRenderer();
    this.models = new VisionModels(config, pluginInstance, this.renderer.gpuMaskTarget);
    this.faceTracking = new FaceTrackingScheduler(
      this.models,
      new FaceMotionTracker(this.renderer.faceMotionImageReader)
    );
    this.background = new BackgroundEffect(this.models);
    this.sticky = new FaceEffectController(this.models);
    this.head = new FaceEffectController(this.models);
    this.beauty = new BeautyController(this.models);
    this.transformStream = this.transformStream.bind(this);
  }

  /** 获取 SDK 处理器类型，用于接入对应的媒体轨道处理链。 */
  public getProcessorType() {
    return this.pluginInstance.getPluginType();
  }

  /** 同步模型路径配置；不创建视频轨道，也不加载模型。 */
  public init() {
    this.models.init();
  }

  /** 获取兼容旧接口的模型引用（vision、imageSegmenter、faceDetector），不是完整构造配置。 */
  public getProcessorConfig() {
    return this.models.getConfig();
  }

  /** 获取已提交的运行配置副本；修改返回值不会影响处理器，模型引用仍由原调用方持有。 */
  public getRuntimeConfig(): IVideoProcessorConfig {
    return copyRuntimeConfig(this.config);
  }

  /**
   * 在保留输入、输出轨道及素材的情况下更新分割、跟踪或美颜配置。
   * 当前帧结束后提交；准备失败保留旧配置。参数校验失败不会取消正在准备的有效请求。
   * 每次 patch 以调用时已提交配置为基准，最后一次有效请求优先，不继承被替代请求的 patch。
   * @returns 提交成功为 true；被后续请求替代或准备期间销毁为 false；准备失败拒绝。
   */
  public async updateConfig(patch: IVideoProcessorConfigPatch): Promise<boolean> {
    if (this.destroyed) throw new Error('处理器已销毁');
    const next = mergeRuntimeConfig(this.config, patch);
    const beauty = patch.beauty ? { ...patch.beauty } : undefined;
    this.configUpdate?.abort();
    const request = new AbortController();
    this.configUpdate = request;
    const beautyRevision = beauty ? ++this.beautyRevision : this.beautyRevision;
    return this.applyRuntimeConfig(next, beauty, beautyRevision, request);
  }

  private async applyRuntimeConfig(
    next: IVideoProcessorConfig,
    requestedBeauty: IBeautyOptions | undefined,
    beautyRevision: number,
    request: AbortController
  ): Promise<boolean> {
    let committed = false;
    try {
      while (this.isCurrentConfig(request)) {
        await this.awaitConfig(request, Promise.allSettled([...this.effectOperations]));
        if (this.effectOperations.size) continue;
        const effectRevision = this.effectRevision;
        const applyBeauty = requestedBeauty && beautyRevision === this.beautyRevision;
        const nextBeauty = applyBeauty ? requestedBeauty : this.beauty.getOptions();
        let preparedBeauty: BeautyController | undefined;
        try {
          if (this.needsSegmentation(nextBeauty)) {
            await this.awaitConfig(request, this.models.prepareSegmenter());
          }
          if (applyBeauty) {
            preparedBeauty = new BeautyController(this.models);
            const preparing = preparedBeauty.setOptions(nextBeauty);
            await this.awaitConfig(request, this.trackEffectOperation(() => preparing, false));
          }
          const result = await this.awaitConfig(
            request,
            this.atFrameBoundary(() => {
              if (!this.isCurrentConfig(request)) return false;
              if (this.effectOperations.size || effectRevision !== this.effectRevision) return 'retry' as const;
              this.models.updateRuntimeConfig(next);
              if (preparedBeauty) {
                this.disposeResource(this.beauty);
                this.beauty = preparedBeauty;
                preparedBeauty = undefined;
              }
              this.config = next;
              this.resetRuntimeTracking();
              committed = true;
              return true;
            })
          );
          if (result !== 'retry') return result;
        } finally {
          this.disposeResource(preparedBeauty);
        }
      }
      return false;
    } catch (error) {
      if (!this.isCurrentConfig(request)) return false;
      throw error;
    } finally {
      if (this.configUpdate === request) this.configUpdate = null;
    }
  }

  private needsSegmentation(beauty: IBeautyOptions) {
    return (
      this.background.enabled ||
      (beauty.enabled && beauty.whiteningEnabled !== false && beauty.whitening > 0)
    );
  }

  private isCurrentConfig(request: AbortController) {
    return !this.destroyed && !request.signal.aborted && this.configUpdate === request;
  }

  /** 取消立即结束公开请求；底层不可取消的模型/设备晚到结果由各资源的 destroy 保护回收。 */
  private async awaitConfig<T>(request: AbortController, operation: Promise<T>): Promise<T> {
    let cancel: () => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error('配置更新已取消'));
      if (request.signal.aborted) cancel();
      else request.signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      return await Promise.race([operation, cancelled]);
    } finally {
      request.signal.removeEventListener('abort', cancel);
    }
  }

  private resetRuntimeTracking() {
    this.cachedMask = null;
    this.maskTimestampMs = this.nextSegmentationMs = -Infinity;
    this.maskSourceWidth = this.maskSourceHeight = 0;
    this.faceTracking.reset();
    this.sticky.resetTracking();
    this.head.resetTracking();
    this.beauty.reset();
  }

  private trackEffectOperation<T>(operation: () => Promise<T>, changesEffects = true): Promise<T> {
    if (changesEffects) this.effectRevision++;
    const pending = operation().finally(() => {
      this.effectOperations.delete(pending);
      if (changesEffects) this.effectRevision++;
    });
    this.effectOperations.add(pending);
    return pending;
  }

  /** 无在途帧时立即提交，包括未 process、暂停效果以及输入暂时没有新帧的场景。 */
  private atFrameBoundary<T>(action: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          resolve(action());
        } catch (error) {
          reject(error);
        }
      };
      if (this.activeFrames) this.frameBoundaryActions.push(run);
      else run();
    });
  }

  private leaveFrame() {
    this.activeFrames--;
    if (!this.activeFrames) this.frameBoundaryActions.splice(0).forEach((action) => action());
  }

  /** 旧资源释放失败不能将已经提交的新配置误报成失败，也不能阻止其他资源回收。 */
  private disposeResource(resource?: { destroy(): void } | null) {
    try {
      resource?.destroy();
    } catch (error) {
      console.warn('video processing resource cleanup error: ', error);
    }
  }

  /**
   * 预加载原有背景与人脸框模型；关键点模型由效果按需申请。
   * @returns { Promise<boolean> } - 加载成功返回 true，失败时拒绝并携带模型加载错误。
   */
  public loadModel() {
    if (this.destroyed) return Promise.reject(new Error('处理器已销毁'));
    return this.trackEffectOperation(() => this.models.preload());
  }

  /**
   * 设置指定类别的效果，模型与素材全部就绪后生效；失败时保留该类别的当前效果。
   * 同一类别只应用最新请求；不同类别独立准备，虚拟头像启用时绘制优先于贴纸。
   *
   * @param { VirtualKind } kind - BACKGROUND、STICKY 或 HEAD，决定配置所属的效果容器。
   * @param { VirtualEffectOptions } options - 与类别匹配的效果配置；type 为 NONE 时清除该类别。
   * @returns { Promise<boolean> } - 请求完成或被后续请求取消后返回 true，不代表该配置仍处于启用状态。
   * @throws 已销毁、类别或配置无效，以及未取消的模型或素材加载失败时抛出错误。
   */
  public async setOptions(kind: VirtualKind, options: VirtualEffectOptions) {
    if (this.destroyed) throw new Error('处理器已销毁');
    return this.trackEffectOperation(async () => {
      try {
        switch (kind) {
          case VirtualKind.BACKGROUND:
            await this.background.setOptions(options as IBackgroundOptions);
            this.cachedMask = null;
            break;
          case VirtualKind.STICKY:
            await this.sticky.setOptions(options as FaceEffectOptions);
            break;
          case VirtualKind.HEAD:
            await this.head.setOptions(options as FaceEffectOptions);
            break;
          default:
            throw new Error(`不支持的效果类别：${kind}`);
        }
      } finally {
        // 以最终已生效效果为准，迟到或失败的准备不能留下多余模型能力。
        await this.syncFaceRequirements();
      }
      return true;
    });
  }

  /**
   * 设置整体增亮和人脸美白，不占用背景或贴纸槽位。
   * 强度为 0～1，整体增亮无需模型；美白在分割模型就绪后生效，失败保留旧配置。
   */
  public async setBeautyOptions(options: IBeautyOptions) {
    if (this.destroyed) throw new Error('处理器已销毁');
    validateBeautyOptions(options);
    this.beautyRevision++;
    return this.trackEffectOperation(async () => {
      try {
        const needsSegment = options.enabled && options.whiteningEnabled !== false && options.whitening > 0;
        if (needsSegment) await this.models.prepareSegmenter();
        await this.beauty.setOptions(options);
      } finally {
        await this.syncFaceRequirements();
      }
    });
  }

  /** 清除全部效果并取消其待生效请求，不停止视频管线或关闭共享模型。 */
  public removeOptions() {
    if (this.destroyed) return;
    this.beautyRevision++;
    this.effectRevision++;
    this.cachedMask = null;
    this.background.clear();
    this.sticky.clear();
    this.head.clear();
    this.beauty.clear();
    this.faceTracking.reset();
    this.trackEffectOperation(() => this.syncFaceRequirements()).catch((error) =>
      console.warn('face model configuration error: ', error)
    );
  }

  /**
   * 开启已配置效果的逐帧处理，不主动加载模型或启动视频采集。
   * @returns { Promise<boolean> } - 成功返回 true；处理器已销毁时拒绝。
   */
  public async enable() {
    if (this.destroyed) throw new Error('处理器已销毁');
    this.enablePlugin = true;
    return true;
  }

  /**
   * 暂停效果处理并透传原始视频帧，保留效果配置及素材以便再次启用。
   * @returns { Promise<boolean> } - 返回关闭后的开关状态 false。
   */
  public async disable() {
    this.enablePlugin = false;
    this.cachedMask = null;
    this.sticky.resetTracking();
    this.head.resetTracking();
    this.beauty.reset();
    this.faceTracking.reset();
    return false;
  }

  /** 获取总开关状态；返回 true 不代表已有可绘制的效果。 */
  public getEnablePluginState() {
    return this.enablePlugin;
  }

  /** 获取总开关与各类已就绪效果共同决定的处理状态，isEnableAI 表示至少一种效果启用。 */
  public isEnable() {
    const isEnableBackground = this.enablePlugin && this.background.enabled;
    const isEnableSticky = this.enablePlugin && this.sticky.enabled;
    const isEnableVirtual = this.enablePlugin && this.head.enabled;
    return {
      isEnableAI: isEnableBackground || isEnableSticky || isEnableVirtual || (this.enablePlugin && this.beauty.enabled),
      isEnableBackground,
      isEnableSticky,
      isEnableVirtual
    };
  }

  /**
   * 初始化渲染后端并连接视频帧处理管线；重复调用会终止旧管线及其输出轨道。
   *
   * @param { IProcessTrack } param - 输入轨道及像素尺寸；width、height 应与输入视频帧一致。
   * @returns { Promise<IProcessTrack> } - 新的输出视频轨道及尺寸；缺失或非视频轨道原样返回。
   * @throws 渲染后端不可用或处理器已销毁时拒绝，不自动降级渲染后端。
   */
  public async process(input: IProcessTrack): Promise<IProcessTrack> {
    this.activeFrames++;
    try {
      return await this.startProcess(input);
    } finally {
      this.leaveFrame();
    }
  }

  private async startProcess({ track, width, height }: IProcessTrack): Promise<IProcessTrack> {
    if (!track || track.kind !== 'video') return { track, width, height };
    if (this.destroyed) throw new Error('处理器已销毁');
    this.trackWidth = width;
    this.trackHeight = height;
    await this.renderer.initialize(width, height);
    if (this.destroyed) throw new Error('处理器已销毁');
    this.cachedMask = null;
    this.pipelineAbort?.abort();
    this.sticky.resetTracking();
    this.head.resetTracking();
    this.beauty.reset();
    this.faceTracking.reset();
    this.trackGenerator?.stop();
    this.outputSize?.listeners.clear();
    this.pipelineAbort = new AbortController();
    const outputSize = { width, height, listeners: new Set<(size: { width: number; height: number }) => void>() };
    this.outputSize = outputSize;
    const signal = this.pipelineAbort.signal;
    // 主线程有插入式媒体流时直接接通；Safari 只有 Worker 提供该接口，改由处理线程建端点。
    this.trackGenerator = await connectVideoPipeline(track, (frame, controller) => this.transformStream(frame, controller), signal, () => new Worker(new URL('./safari-track.worker.ts', import.meta.url)));
    if (this.destroyed || signal.aborted) {
      this.trackGenerator.stop();
      throw new Error('处理器已销毁');
    }
    return {
      track: this.trackGenerator,
      width,
      height,
      onSizeChange: (listener) => {
        if (this.destroyed || this.outputSize !== outputSize) return () => undefined;
        outputSize.listeners.add(listener);
        listener({ width: outputSize.width, height: outputSize.height });
        return () => outputSize.listeners.delete(listener);
      }
    };
  }

  /** 生成轨道的 getSettings 可能缺少尺寸，按实际帧通知发送端，透传模式同样生效。 */
  private updateOutputSize(width: number, height: number) {
    const outputSize = this.outputSize;
    if (!outputSize || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    if (outputSize.width === width && outputSize.height === height) return;
    outputSize.width = width;
    outputSize.height = height;
    this.trackWidth = width;
    this.trackHeight = height;
    outputSize.listeners.forEach((listener) => {
      try {
        listener({ width, height });
      } catch (error) {
        console.warn('video output size listener error: ', error);
      }
    });
  }

  /**
   * 将当前输出轨道包装为媒体流，须在 process 成功后调用。
   * @returns { MediaStream } - 包含当前输出轨道的新流对象，不克隆轨道。
   */
  public getProcessStream() {
    return new MediaStream([this.trackGenerator]);
  }

  /**
   * 处理单个视频帧；效果关闭或本帧渲染失败时透传原帧，成功时保留原始时间戳。
   *
   * @param { VideoFrame } videoFrame - 输入帧；合成后关闭，透传成功后转交下游持有。
   * @param { TransformStreamDefaultController<VideoFrame> } controller - 接收输出帧的流控制器。
   * @returns { Promise<void> } - 输出入队后完成；入队失败会释放未交付的帧并抛出错误。
   */
  public async transformStream(
    videoFrame: any,
    controller: Pick<TransformStreamDefaultController<VideoFrame>, 'enqueue'>
  ) {
    this.activeFrames++;
    try {
      await this.renderFrame(videoFrame, controller);
    } finally {
      this.leaveFrame();
    }
  }

  private async renderFrame(
    videoFrame: any,
    controller: Pick<TransformStreamDefaultController<VideoFrame>, 'enqueue'>
  ) {
    const started = performance.now();
    const sample: VideoPerformanceSample = {
      timestamp: started,
      inputWidth: videoFrame.displayWidth || this.trackWidth,
      inputHeight: videoFrame.displayHeight || this.trackHeight,
      maskWidth: 0,
      maskHeight: 0,
      segmentationMs: 0,
      faceMs: 0,
      faceDetectorRan: false,
      renderMs: 0,
      totalMs: 0,
      segmented: false,
      maskAgeMs: 0,
      failed: false
    };
    if (this.destroyed) {
      videoFrame.close();
      return;
    }
    this.updateOutputSize(sample.inputWidth, sample.inputHeight);
    if (!this.isEnable().isEnableAI) {
      this.enqueueOriginal(videoFrame, controller);
      this.reportPerformance(sample);
      return;
    }
    const frame: FrameContext = {
      videoFrame,
      width: sample.inputWidth,
      height: sample.inputHeight,
      timestamp: started
    };
    // MediaPipe 的输入适配需要 width/height；输出时间戳始终使用原始帧时间。
    videoFrame.width = frame.width;
    videoFrame.height = frame.height;
    let output: VideoFrame;
    try {
      await this.renderer.initialize(frame.width, frame.height);
      if (this.destroyed) {
        videoFrame.close();
        return;
      }
      const mediaTimeMs = Number.isFinite(videoFrame.timestamp) ? videoFrame.timestamp / 1000 : started;
      const options = this.createRenderOptions(frame, sample, mediaTimeMs);
      const renderStarted = performance.now();
      await this.renderer.render(options);
      sample.renderMs = performance.now() - renderStarted;
      if (this.destroyed) {
        videoFrame.close();
        return;
      }
      const outputStarted = performance.now();
      output = new VideoFrame(this.renderer.getCanvas(), { timestamp: videoFrame.timestamp, alpha: 'discard' });
      sample.outputFrameMs = performance.now() - outputStarted;
    } catch (error) {
      console.warn('video frame render error: ', error);
      this.cachedMask = null;
      if (this.destroyed) {
        videoFrame.close();
        return;
      }
      sample.failed = true;
      sample.failureReason = error instanceof Error ? error.message : String(error);
      this.reportPerformance(sample);
      this.enqueueOriginal(videoFrame, controller);
      return;
    }
    try {
      controller.enqueue(output);
    } catch (error) {
      output.close();
      throw error;
    } finally {
      videoFrame.close();
    }
    this.reportPerformance(sample);
  }

  /** 永久停止管线和输出轨道，释放效果及独占模型、渲染资源，并清除插件缓存引用；可重复调用。 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.enablePlugin = false;
    this.cachedMask = null;
    this.pipelineAbort?.abort();
    this.trackGenerator?.stop();
    this.outputSize?.listeners.clear();
    this.outputSize = null;
    this.configUpdate?.abort();
    // 先终止输入，等当前帧结束后再释放它正在使用的资源。
    void this.atFrameBoundary(() => {
      this.disposeResource(this.background);
      this.disposeResource(this.sticky);
      this.disposeResource(this.head);
      this.disposeResource(this.beauty);
      this.disposeResource(this.faceTracking);
      this.disposeResource(this.models);
      this.disposeResource(this.renderer);
      this.disposeResource(this.pluginInstance);
    });
  }

  /**
   * 根据启用效果生成合成指令：虚拟头像隐藏摄像头底图，普通贴纸保留视频，背景单独执行分割。
   * @param { FrameContext } frame - 当前视频帧及推理信息。
   * @returns { FrameRenderOptions } - 后端无关的底图模式、分割掩码和叠加层配置。
   */
  private createRenderOptions(
    frame: FrameContext,
    sample: VideoPerformanceSample,
    mediaTimeMs: number
  ): FrameRenderOptions {
    const { isEnableBackground, isEnableVirtual } = this.isEnable();
    const faceStarted = performance.now();
    const faceEffect = isEnableVirtual ? this.head : this.sticky;
    (isEnableVirtual ? this.sticky : this.head).resetTracking();
    const inferenceCount = this.models.faceInferenceCount;
    const trackingRequest = this.getFaceTrackingRequest();
    const inferenceStarted = performance.now();
    let tracked: FaceTrackingSnapshot;
    let inferenceFailed = false;
    try {
      tracked = this.faceTracking.track(frame, trackingRequest);
    } catch (error) {
      // 人脸模型异常只隐藏局部效果，背景和人像分割美白仍按原计划合成。
      inferenceFailed = true;
      this.beauty.reset();
      faceEffect.resetTracking();
      tracked = this.faceTracking.track(frame, { kind: 'none' });
      console.warn('face tracking error: ', error);
    }
    const inferenceRan = this.models.faceInferenceCount > inferenceCount;
    sample.faceDetectorRan = inferenceRan && trackingRequest.tracking?.mode === 'bounds';
    sample.faceLandmarkerRan = inferenceRan && trackingRequest.tracking?.mode === 'landmarks';
    sample.faceInferenceMs = inferenceFailed ? Math.max(0, performance.now() - inferenceStarted) : tracked.inferenceMs;
    sample.faceInferenceCount = this.models.faceInferenceCount - inferenceCount;
    sample.faceAgeMs = tracked.ageMs;
    sample.faceMotionMs = tracked.motionMs;
    sample.faceMotionTracked = tracked.motionTracked;
    sample.faceMotionConfidence = tracked.motionConfidence;
    sample.faceMotionFallback = tracked.motionFallback;
    sample.faceMotionUnavailable = tracked.motionUnavailable;
    sample.faceMotionBoosted = tracked.motionBoosted;
    sample.faceTrackingIntervalMs = tracked.intervalMs;
    // 头像隐藏真人时停止美白，恢复后由调度器重新定位。
    if (isEnableVirtual) this.beauty.reset();
    const overlay = faceEffect.render(tracked.face);
    const beauty = isEnableVirtual
      ? undefined
      : this.beauty.render(frame);
    sample.faceEffectFailed = inferenceFailed || faceEffect.failedThisFrame;
    if (beauty && this.beauty.needsFace) {
      sample.beautyFaceDetected = beauty.faceCount > 0 || !!beauty.landmarks;
      sample.beautyTracked = beauty.tracked;
    }
    sample.beautyWhiteningSuppressed = beauty?.whiteningSuppressedBySticker;
    sample.faceMs = performance.now() - faceStarted;
    let result: SegmentationMask | GpuSegmentationMask | null = null;
    // 背景和人像美白共用一次分割；没有背景时仍保留原画面，只把蒙版交给美白。
    if (!isEnableVirtual && (isEnableBackground || this.beauty.needsSegment)) {
      const segmentStarted = performance.now();
      const performanceConfig = this.config.experimentalPerformance;
      const elapsed = mediaTimeMs - this.maskTimestampMs;
      const interval = 1000 / (performanceConfig?.segmentationFps ?? 15);
      const resetSchedule =
        !this.cachedMask ||
        elapsed < 0 ||
        this.maskSourceWidth !== frame.width ||
        this.maskSourceHeight !== frame.height;
      if (resetSchedule || mediaTimeMs + 1 >= this.nextSegmentationMs) {
        this.cachedMask = this.models.segmentGpu(frame);
        // 按媒体时间推进固定节拍；20fps 输入也能接近 15Hz，不因逐帧取整退到 10Hz。
        this.nextSegmentationMs = resetSchedule
          ? mediaTimeMs + interval
          : this.nextSegmentationMs +
            Math.max(1, Math.floor((mediaTimeMs - this.nextSegmentationMs) / interval) + 1) * interval;
        this.maskTimestampMs = mediaTimeMs;
        this.maskSourceWidth = frame.width;
        this.maskSourceHeight = frame.height;
        sample.segmented = true;
      }
      result = this.cachedMask;
      sample.maskAgeMs = result ? Math.max(0, mediaTimeMs - this.maskTimestampMs) : 0;
      sample.segmentationMs = sample.segmented ? performance.now() - segmentStarted : 0;
      if (!result) throw new Error('分割未返回有效 mask');
    } else {
      this.cachedMask = null;
    }
    const mask = result && 'data' in result ? result.data : null;
    const gpuMask = !!result && 'kind' in result && result.kind === 'gpu';
    sample.maskWidth = result?.width ?? 0;
    sample.maskHeight = result?.height ?? 0;
    let baseMode: FrameRenderOptions['baseMode'] = isEnableBackground && result ? 'segmented' : 'video';
    if (isEnableVirtual) baseMode = isEnableBackground ? 'background' : 'transparent';
    return {
      videoFrame: frame.videoFrame,
      baseMode,
      backgroundOptions: this.background.options,
      backgroundSource: this.background.source,
      mask,
      gpuMask,
      maskWidth: result?.width,
      maskHeight: result?.height,
      maskFormat: result?.format,
      edgeRefinement: this.config.experimentalPerformance?.edgeRefinement ?? true,
      maskBlur: this.config.maskBlur ?? 0,
      overlaySource: overlay?.kind === 'image' ? overlay.source : null,
      overlayRects: overlay?.kind === 'image' ? overlay.rects : [],
      faceSticker: overlay?.kind === 'face-sticker' ? overlay.sticker : null,
      beauty
    };
  }

  /** 可见效果的需求汇总；隐藏中的效果不会抬高推理频率或模型输出。 */
  private getFaceTrackingRequest(): FaceTrackingRequest {
    const effect = this.head.enabled ? this.head : this.sticky;
    const tracking = effect.tracking;
    if (this.head.enabled) {
      return {
        kind: tracking?.mode === 'landmarks' ? '3d' : 'bounds',
        tracking,
        landmarksFps: this.config.faceTracking?.landmarkFps ?? 20,
        motionBoost: this.config.faceTracking?.motionBoost,
        experimentalInterFrameTracking: this.config.faceTracking?.experimentalInterFrameTracking
      };
    }
    if (tracking?.mode === 'landmarks') {
      return {
        kind: '3d',
        tracking,
        landmarksFps: this.config.faceTracking?.landmarkFps ?? 20,
        motionBoost: this.config.faceTracking?.motionBoost,
        experimentalInterFrameTracking: this.config.faceTracking?.experimentalInterFrameTracking
      };
    }
    if (tracking) return { kind: 'bounds', tracking };
    if (this.beauty.needsFace) return { kind: 'beauty', tracking: { mode: 'bounds' } };
    return { kind: 'none' };
  }

  private async syncFaceRequirements() {
    if (this.destroyed) return;
    const request = this.getFaceTrackingRequest();
    const tracking = request.tracking ?? null;
    try {
      if (tracking?.mode === 'bounds' && !this.models.supportsFaceRequirements(tracking)) {
        await this.models.prepareFace(tracking);
      }
      await this.models.syncFaceRequirements(tracking);
    } catch (error) {
      if (this.destroyed) return;
      // 候选效果提交前已持有必需能力。多余输出关闭失败但旧图恢复成功时，
      // 当前效果仍可用；清理失败不能把一次成功切换误报成加载失败。
      if (!this.models.supportsFaceRequirements(tracking)) throw error;
      console.warn('face model capability cleanup error: ', error);
    }
  }

  /** 当前画面实际可见的人脸效果；虚拟头像优先于普通贴纸。 */
  private getVisibleFaceTracking(): FaceTracking | null {
    if (this.head.enabled) return this.head.tracking ?? null;
    if (this.sticky.enabled) return this.sticky.tracking ?? null;
    return null;
  }

  /** 观测回调不能中断帧处理，也不把其自身的 UI 开销计入处理耗时。 */
  private reportPerformance(sample: VideoPerformanceSample) {
    sample.totalMs = performance.now() - sample.timestamp;
    try {
      this.config.onPerformanceSample?.(sample);
    } catch {
      // 性能面板属于可选观测，不参与视频输出正确性。
    }
  }

  /**
   * 透传原帧并转交所有权，入队失败时关闭该帧以防泄漏。
   * @param { VideoFrame } frame - 不再由本处理器继续使用的原始帧。
   * @param { TransformStreamDefaultController<VideoFrame> } controller - 下游输出队列。
   */
  private enqueueOriginal(
    frame: VideoFrame,
    controller: Pick<TransformStreamDefaultController<VideoFrame>, 'enqueue'>
  ) {
    try {
      controller.enqueue(frame);
    } catch (error) {
      frame.close();
      throw error;
    }
  }
}
