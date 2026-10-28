import type { IStickyOptions } from '../../../type';
import type { EffectOverlay, FaceFrame, FaceTracking } from '../../types';
import { loadImage } from '../../resources/load-image';
import type { FaceEffect } from '../face-effect';
import { estimateFaceStickerCoverage } from './sticker-content-bounds';

/** 基于关键点描述人脸网格或姿态平面贴纸，由输出后端选择原生绘制或兼容画布。 */
export class ImageStickerEffect implements FaceEffect {
  public readonly tracking: FaceTracking;
  private source: HTMLImageElement | null = null;
  private faceCoverage: number | undefined;

  /**
   * 校验并复制 3D 定位配置，避免外部修改偏移数组影响正在运行的效果。
   * @param { IStickyOptions } options - 图片地址及定位参数；缺省使用 face 锚点、1.25 倍脸宽和零偏移。
   * @throws 图片地址为空或定位参数无效时抛出错误。
   */
  constructor(private options: IStickyOptions) {
    const { mode = 'plane' } = options.placement ?? {};
    this.tracking = { mode: 'landmarks', transformationMatrixes: mode !== 'mesh' };
    if (!options.url || !['plane', 'mesh'].includes(mode) || !['fill', 'contain'].includes(options.fit ?? 'fill')) {
      throw new Error('3D 贴纸需要图片 URL、有效的 plane/mesh 模式和 fill/contain 填充方式');
    }
    if (mode === 'mesh') {
      this.options = { ...options, placement: { mode: 'mesh' } };
      return;
    }
    const { anchor = 'face', scale = 1.25, offset = [0, 0, 0], constrainToChin = false } = options.placement ?? {};
    if (
      !options.url ||
      !['face', 'eyes', 'forehead', 'nose'].includes(anchor) ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Array.isArray(offset) ||
      offset.length !== 3 ||
      !offset.every(Number.isFinite) ||
      typeof constrainToChin !== 'boolean'
    ) {
      throw new Error('3D 贴纸需要图片 URL、有效锚点、正数 scale、三个有限数值的 offset 和布尔值 constrainToChin');
    }
    this.options = {
      ...options,
      placement: { ...options.placement, anchor, scale, offset: [...offset], constrainToChin }
    };
  }

  /** 加载素材；GPU 资源由合成后端按需创建，切换取消时不提交晚到图片。 */
  public async prepare(signal: AbortSignal) {
    const image = await loadImage(this.options.url, signal);
    signal.throwIfAborted();
    this.faceCoverage = estimateFaceStickerCoverage(image, this.options.fit ?? 'fill', this.options.placement);
    this.source = image;
  }

  /** 只传递借用的素材与跟踪结果，不创建画布或逐帧中转纹理。 */
  public render(frame: FaceFrame): EffectOverlay | null {
    if (!this.source || !frame.landmarks) return null;
    return {
      kind: 'face-sticker',
      sticker: {
        source: this.source,
        landmarks: frame.landmarks,
        placement: this.options.placement,
        fit: this.options.fit ?? 'fill',
        faceCoverage: this.faceCoverage
      }
    };
  }

  /** GPU 资源归渲染后端所有，仅清除当前效果素材引用。 */
  public destroy() {
    this.source = null;
    this.faceCoverage = undefined;
  }
}
