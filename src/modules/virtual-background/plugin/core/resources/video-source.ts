/** 背景视频/流的播放、加载取消与释放。 */
export class VideoSource {
  public readonly video = document.createElement('video');
  private destroyed = false;

  /**
   * 创建背景视频资源，直到 load 调用时才开始播放。
   *
   * @param { string } url - 视频地址，仅未传入 stream 时使用。
   * @param { MediaStream | null } stream - 可选输入流；其轨道交由本资源管理，destroy 时会停止。
   */
  constructor(private url: string, private stream: MediaStream | null = null) {}

  /**
   * 配置静音循环播放，并等待视频可供绘制。
   *
   * @param { AbortSignal } signal - 取消加载的信号；资源拥有者仍须调用 destroy 释放视频和流。
   * @returns { Promise<void> } - canplay 后完成；播放失败或取消时拒绝。
   */
  public load(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const video = this.video;
      const cleanup = () => {
        video.oncanplay = null;
        video.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const fail = (error: unknown) => {
        cleanup();
        reject(error);
      };
      const abort = () => fail(signal.reason);
      video.oncanplay = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => fail(new Error('背景视频加载失败'));
      signal.addEventListener('abort', abort, { once: true });
      video.crossOrigin = 'Anonymous';
      video.loop = true;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      if (this.stream) video.srcObject = this.stream;
      else video.src = this.url;
      video.play().catch(fail);
    });
  }

  /** 停止视频播放及传入流的全部轨道，清空媒体引用；可重复调用。 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
