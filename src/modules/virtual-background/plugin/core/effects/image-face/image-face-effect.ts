import type { IStickyOptions } from '../../../type';
import type { EffectOverlay, FaceFrame, FaceTracking } from '../../types';
import { loadImage } from '../../resources/load-image';
import type { FaceEffect } from '../face-effect';
import { FaceRectLayout } from './face-rect-layout';

/** 2D 贴纸和虚拟头像共享图片效果，由管线决定是否保留摄像头底图。 */
export class ImageFaceEffect implements FaceEffect {
  public readonly tracking: FaceTracking = { mode: 'bounds' };
  private source: HTMLImageElement | null = null;
  private layout = new FaceRectLayout();

  /** @param { IStickyOptions } options - 2D 图片地址和缩放方式；不使用 3D placement 参数。 */
  constructor(private options: IStickyOptions) {}

  /**
   * 加载图片，仅在请求未取消时保存素材引用。
   * @param { AbortSignal } signal - 效果切换请求的取消信号。
   * @returns { Promise<void> } - 图片就绪后完成，加载失败或取消时拒绝。
   */
  public async prepare(signal: AbortSignal) {
    const image = await loadImage(this.options.url, signal);
    signal.throwIfAborted();
    this.source = image;
  }

  /**
   * 将同一图片布局到当前帧的各个人脸区域。
   * @param { FaceFrame } frame - 带人脸检测框的帧上下文。
   * @returns { EffectOverlay | null } - 图片及目标区域；图片未就绪或无人脸时为 null。
   */
  public render(frame: FaceFrame): EffectOverlay | null {
    if (!this.source) return null;
    const timestamp = Number.isFinite(frame.videoFrame.timestamp) ? frame.videoFrame.timestamp / 1000 : frame.timestamp;
    const rects = this.layout.getRects(
      frame.detections,
      this.source,
      frame.width,
      frame.height,
      this.options.fit,
      timestamp,
      frame.detectionTimestamp
    );
    return rects.length ? { kind: 'image', source: this.source, rects } : null;
  }

  /** 清除图片引用；图片 URL 的生命周期仍由提供方管理。 */
  public destroy() {
    this.source = null;
    this.resetTracking();
  }

  public resetTracking() {
    this.layout.reset();
  }
}
