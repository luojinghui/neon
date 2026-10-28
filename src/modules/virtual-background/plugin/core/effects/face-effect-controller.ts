import { type FaceEffectOptions, VirtualType } from '../../type';
import type { VisionModels } from '../models/vision-models';
import { EffectSlot } from '../resources/effect-slot';
import type { EffectOverlay, FaceFrame } from '../types';
import type { FaceEffect, FaceEffectRegistry } from './face-effect';
import { faceEffectRegistry } from './face-effect-registry';

/** 统一调度人脸效果的模型准备、异步切换和逐帧绘制，不依赖具体贴纸实现。 */
export class FaceEffectController {
  private slot = new EffectSlot<FaceEffect>();
  private renderFailed = false;

  /**
   * @param { VisionModels } models - 提供人脸模型准备与推理能力的共享模型管理器。
   * @param { FaceEffectRegistry } registry - 效果类型到工厂的映射，默认使用内置图片效果。
   */
  constructor(
    private models: Pick<VisionModels, 'prepareFace' | 'holdFaceRequirements'>,
    private registry: FaceEffectRegistry = faceEffectRegistry
  ) {}

  /** 由处理器等待异步效果请求结束后调用，不重建已加载的效果素材。 */
  public rebindModels(models: Pick<VisionModels, 'prepareFace' | 'holdFaceRequirements'>) {
    this.models = models;
    this.resetTracking();
  }

  public get enabled() {
    return !!this.slot.current;
  }

  public get tracking() {
    return this.slot.current?.tracking;
  }

  /** 当前帧绘制描述生成是否失败；无脸不算失败。 */
  public get failedThisFrame() {
    return this.renderFailed;
  }

  /**
   * 根据类型创建效果，模型和素材全部就绪后启用；切换失败时保留原效果。
   *
   * @param { FaceEffectOptions } options - 人脸效果配置；NONE 清除效果，未知类型抛出错误。
   * @returns { Promise<void> } - 请求完成或被后续请求取消后结束；未取消的加载失败会拒绝。
   */
  public async setOptions(options: FaceEffectOptions) {
    if (options.type === VirtualType.NONE) {
      this.clear();
      return;
    }
    const factory = this.registry.get(options.type);
    if (!factory) throw new Error(`不支持的人脸效果：${options.type}`);
    const effect = factory({ ...options });
    const release = this.models.holdFaceRequirements(effect.tracking);
    try {
      await this.slot.replace(effect, async (signal) => {
        await Promise.all([this.models.prepareFace(effect.tracking), effect.prepare(signal)]);
      });
    } finally {
      release();
    }
  }

  /** 消费共享调度器的快照；效果层不再调用模型或维护另一套检测缓存。 */
  public render(frame: FaceFrame): EffectOverlay | null {
    this.renderFailed = false;
    const effect = this.slot.current;
    if (!effect) return null;
    try {
      return effect.render(frame);
    } catch (error) {
      this.renderFailed = true;
      effect.resetTracking?.();
      console.warn('face effect render error: ', error);
      return null;
    }
  }

  /** 暂停或切换输入时清理效果自己的布局状态。 */
  public resetTracking() {
    this.renderFailed = false;
    this.slot.current?.resetTracking?.();
  }

  /** 取消加载并清除当前效果，保留后续重新设置的能力。 */
  public clear() {
    this.resetTracking();
    this.slot.clear();
  }

  /** 永久释放人脸效果容器；共享模型仍由处理器管理。 */
  public destroy() {
    this.resetTracking();
    this.slot.destroy();
  }
}
