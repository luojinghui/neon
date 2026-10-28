import type { FaceEffectOptions, VirtualType } from '../../type';
import type { EffectOverlay, FaceFrame, FaceTracking } from '../types';

/**
 * 人脸效果只负责素材与自身渲染，不持有模型、视频轨道或最终合成器。
 * prepare 可取消；destroy 必须可重复调用，并能清理初始化未完成的资源。
 * 异步加载返回后须检查 signal，取消时释放晚到的资源，不再创建或提交渲染对象。
 */
export interface FaceEffect {
  /** 效果所需的模型输出；处理器汇总需求，共享调度器执行推理。 */
  readonly tracking: FaceTracking;
  /**
   * 加载当前效果的素材和渲染资源。
   * @param { AbortSignal } signal - 切换、清除或销毁效果时触发的取消信号。
   * @returns { Promise<void> } - 资源就绪后完成；失败时拒绝，由容器负责回收。
   */
  prepare(signal: AbortSignal): Promise<void>;
  /**
   * 根据当前帧推理结果生成叠加层。
   * @param { FaceFrame } frame - 与 tracking 模式对应的检测结果及视频帧信息。
   * @returns { EffectOverlay | null } - 当前帧借用的叠加层，无可绘制内容时为 null。
   */
  render(frame: FaceFrame): EffectOverlay | null;
  /** 丢弃布局或插值状态，不释放素材和 GPU 资源。 */
  resetTracking?(): void;
  /** 释放效果独占资源，不释放共享模型、输入帧或最终合成器。 */
  destroy(): void;
}

export type FaceEffectFactory = (options: FaceEffectOptions) => FaceEffect;
export type FaceEffectRegistry = ReadonlyMap<VirtualType, FaceEffectFactory>;
