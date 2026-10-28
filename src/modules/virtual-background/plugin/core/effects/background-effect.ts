import { type IBackgroundOptions, VirtualType } from '../../type';
import type { VisionModels } from '../models/vision-models';
import { EffectSlot } from '../resources/effect-slot';
import { loadImage } from '../resources/load-image';
import { VideoSource } from '../resources/video-source';

/** 单次背景配置持有的素材；纯色和模糊背景无需加载额外媒体。 */
class BackgroundResource {
  public source: HTMLImageElement | HTMLVideoElement | null = null;
  private video: VideoSource | null = null;

  constructor(public readonly options: IBackgroundOptions) {}

  /**
   * 按背景类型加载图片或视频，取消后不再更新可绘制素材。
   *
   * @param { AbortSignal } signal - 当前效果切换请求的取消信号。
   * @returns { Promise<void> } - 素材就绪后完成；无外部素材的类型直接完成。
   */
  public async prepare(signal: AbortSignal) {
    const { type, url = '', stream = null } = this.options;
    if (type === VirtualType.IMAGE) {
      const image = await loadImage(url, signal);
      signal.throwIfAborted();
      this.source = image;
    } else if (type === VirtualType.VIDEO || type === VirtualType.STREAM) {
      if ((type === VirtualType.VIDEO && !url) || (type === VirtualType.STREAM && !stream)) {
        throw new Error('视频背景需要 URL 或 MediaStream');
      }
      this.video = new VideoSource(url, stream);
      await this.video.load(signal);
      signal.throwIfAborted();
      this.source = this.video.video;
    }
  }

  /** 释放素材引用及视频资源；流背景同时停止其全部轨道。 */
  public destroy() {
    this.video?.destroy();
    this.video = null;
    this.source = null;
  }
}

/** 只管理背景配置和素材；分割合成由统一帧管线决定。 */
export class BackgroundEffect {
  private slot = new EffectSlot<BackgroundResource>();
  private loadingStream: { stream: MediaStream; ready: Promise<void> } | null = null;

  /** @param { VisionModels } models - 处理器共享的模型管理器，本效果不负责销毁。 */
  constructor(private models: VisionModels) {}

  /** 在处理器的帧边界替换模型管理器，保留图片、视频与共享流素材。 */
  public rebindModels(models: VisionModels) {
    this.models = models;
  }

  public get enabled() {
    return !!this.slot.current;
  }
  public get options(): IBackgroundOptions {
    return this.slot.current?.options ?? { type: VirtualType.NONE };
  }
  public get source() {
    return this.slot.current?.source ?? null;
  }

  /**
   * 并行准备分割模型和背景素材，成功后替换当前背景；同一流复用已生效或加载中的资源。
   *
   * @param { IBackgroundOptions } options - 背景配置；NONE 清除背景，STREAM 的轨道随素材释放。
   * @returns { Promise<void> } - 请求完成或被取消后结束；加载失败时拒绝并保留原背景。
   */
  public async setOptions(options: IBackgroundOptions) {
    if (options.type === VirtualType.NONE) {
      this.clear();
      return;
    }
    const supported = [VirtualType.IMAGE, VirtualType.VIDEO, VirtualType.STREAM, VirtualType.COLOR, VirtualType.BLUR];
    if (!supported.includes(options.type)) throw new Error(`不支持的背景效果：${options.type}`);
    if (options.type === VirtualType.STREAM && options.stream && this.options.stream === options.stream) {
      this.slot.keepCurrent();
      this.loadingStream = null;
      return;
    }
    // 同一流尚在准备时复用请求，避免取消旧请求时停止新请求仍要使用的轨道。
    if (options.type === VirtualType.STREAM && options.stream && this.loadingStream?.stream === options.stream) {
      return this.loadingStream.ready;
    }
    const resource = new BackgroundResource({ ...options });
    const ready = this.slot.replace(resource, async (signal) => {
      await Promise.all([this.models.prepareSegmenter(), resource.prepare(signal)]);
    });
    this.loadingStream =
      options.type === VirtualType.STREAM && options.stream ? { stream: options.stream, ready } : null;
    try {
      await ready;
    } finally {
      if (this.loadingStream?.ready === ready) this.loadingStream = null;
    }
  }

  /** 取消加载并清除当前背景，允许之后重新设置。 */
  public clear() {
    this.loadingStream = null;
    this.slot.clear();
  }
  /** 取消加载并永久释放背景容器，不销毁共享模型。 */
  public destroy() {
    this.loadingStream = null;
    this.slot.destroy();
  }
}
