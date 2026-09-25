export function assertMediaSupport(): void {
  if (!window.isSecureContext) throw new Error('请使用 HTTPS 打开星球后通话');
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('当前浏览器不支持通话，请使用 Safari、Chrome 或 Edge 打开');
}

export function mediaError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '未获得设备权限，请在浏览器设置中允许麦克风或摄像头后重试';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '未找到可用设备，请检查麦克风或摄像头';
  if (name === 'NotReadableError' || name === 'AbortError') return '设备暂不可用，可能被其他应用占用，请重试';
  return error instanceof Error ? error.message : '通话连接失败，请重试';
}

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

/** Each device is acquired only from a user action. Closing it releases hardware. */
export class LocalMedia {
  readonly stream = new MediaStream();
  private generation = 0;
  private disposed = false;

  async enable(kind: 'audio' | 'video', facingMode: 'user' | 'environment' = 'user'): Promise<void> {
    if (this.disposed) return;
    const generation = this.generation;
    const acquired = await navigator.mediaDevices.getUserMedia(kind === 'audio'
      ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }
      : { audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
    if (this.disposed || generation !== this.generation) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    this.disable(kind);
    acquired.getTracks().forEach((track) => this.stream.addTrack(track));
  }

  disable(kind: 'audio' | 'video'): void {
    for (const track of this.stream.getTracks().filter((track) => track.kind === kind)) {
      track.stop();
      this.stream.removeTrack(track);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.disable('audio');
    this.disable('video');
  }
}
