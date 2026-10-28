interface Disposable {
  destroy(): void;
}

/** 统一处理效果切换：准备成功才替换，过期结果和取消的请求负责回收。 */
export class EffectSlot<T extends Disposable> {
  public current: T | null = null;
  private pending: { controller: AbortController; value: T } | null = null;
  private destroyed = false;

  /**
   * 准备并切换效果；只应用最后一次请求，准备失败时保留当前效果。
   *
   * @param { T } next - 待启用的效果；传入后由容器负责释放，包括失败和取消场景。
   * @param { Function } prepare - 异步准备函数，须响应取消信号，避免取消后写入已释放的资源。
   * @returns { Promise<void> } - 准备流程结束后完成；被后续请求取消不视为错误，完成不代表 next 一定已启用。
   * @throws 容器已销毁或未取消的准备过程失败时抛出错误。
   */
  public async replace(next: T, prepare: (signal: AbortSignal) => Promise<void>) {
    if (this.destroyed) {
      next.destroy();
      throw new Error('效果容器已销毁');
    }
    this.cancelPending();
    const pending = new AbortController();
    this.pending = { controller: pending, value: next };

    try {
      await prepare(pending.signal);
      if (pending.signal.aborted) {
        return;
      }
      const previous = this.current;
      this.current = next;
      previous?.destroy();
    } catch (error) {
      if (!pending.signal.aborted) {
        // 模型和素材可以并发准备，任一失败都取消同一请求中的剩余加载。
        pending.abort();
        next.destroy();
        throw error;
      }
    } finally {
      if (this.pending?.controller === pending) this.pending = null;
    }
  }

  /** 取消待生效请求并释放当前效果；容器仍可接受后续切换。 */
  public clear() {
    this.cancelPending();
    this.current?.destroy();
    this.current = null;
  }

  /** 仅取消待生效请求，保留当前效果及其资源。 */
  public keepCurrent() {
    this.cancelPending();
  }

  /** 释放所有效果并永久关闭容器，可重复调用。 */
  public destroy() {
    this.destroyed = true;
    this.clear();
  }

  /** 通知准备任务取消，并立即回收该请求持有的效果资源。 */
  private cancelPending() {
    this.pending?.controller.abort();
    this.pending?.value.destroy();
    this.pending = null;
  }
}
