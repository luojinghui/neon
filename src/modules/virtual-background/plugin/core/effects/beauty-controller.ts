import type { IBeautyOptions } from '../../type';
import type { VisionModels } from '../models/vision-models';
import type { BeautyFrame, FrameContext } from '../types';
import { validateBeautyOptions } from '../runtime-config';

const EMPTY_FACES = new Array<number>(16).fill(0);

/** 整体增亮与人像分割美白；不跑人脸模型，美白复用分割蒙版。 */
export class BeautyController {
  private options: IBeautyOptions = { enabled: false, brightness: 0, whitening: 0 };
  private revision = 0;
  private destroyed = false;

  constructor(_models: Pick<VisionModels, 'prepareFace' | 'holdFaceRequirements'>) {}

  public getOptions(): IBeautyOptions {
    return { ...this.options };
  }

  public rebindModels(_models: Pick<VisionModels, 'prepareFace' | 'holdFaceRequirements'>) {
    return;
  }

  public get enabled() {
    return this.brightness > 0 || this.needsWhitening;
  }

  /** 人像分割美白不申请人脸跟踪。 */
  public get needsFace() {
    return false;
  }

  public get needsWhitening() {
    return this.options.enabled && this.options.whiteningEnabled !== false && this.options.whitening > 0;
  }

  public get needsSegment() {
    return this.needsWhitening;
  }

  private get brightness() {
    if (!this.options.enabled) return 0;
    const brightening = this.options.brightnessEnabled !== false;
    const requested = brightening ? this.options.brightness : 0;
    // 只开美白时也会离开原帧。内部至少给 1% 增亮，避免整幅停在偏暗的 WebGL 结果上；不改用户滑条。
    if (!brightening && !this.needsWhitening) return 0;
    return Math.max(requested, 0.01);
  }

  /** 校验并提交开关与强度。分割模型由处理器准备，这里不加载人脸模型。 */
  public async setOptions(options: IBeautyOptions) {
    if (this.destroyed) throw new Error('美颜已销毁');
    validateBeautyOptions(options);
    const revision = ++this.revision;
    if (this.destroyed || revision !== this.revision) return;
    this.options = { ...options };
  }

  /** 每帧提交增亮和人像美白强度；没有有效配置时不产生绘制描述。 */
  public render(_frame: FrameContext): BeautyFrame | undefined {
    if (!this.enabled || this.destroyed) return;
    return {
      brightness: this.brightness,
      whitening: this.needsWhitening ? this.options.whitening : 0,
      maskMode: 'segment',
      landmarks: null,
      faceRects: EMPTY_FACES,
      faceEyes: EMPTY_FACES,
      faceMouths: EMPTY_FACES,
      faceCount: 0,
      timestamp: 0,
      faceStrength: 1,
      tracked: false
    };
  }

  public reset() {
    return;
  }

  public clear() {
    this.revision++;
    this.options = { ...this.options, enabled: false };
  }

  public destroy() {
    this.destroyed = true;
    this.clear();
  }
}
