import { DEFAULT_VIDEO_EFFECTS, effectsEnabled, type VideoEffectsSettings, type VideoEffectsStatus, type VideoProcessor, type VideoProcessorFactory } from '../video-effects/types';

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
  private camera: MediaStreamTrack | null = null;
  private processor: VideoProcessor | null = null;
  private processing = false;
  private effectGeneration = 0;
  private settings = { ...DEFAULT_VIDEO_EFFECTS };
  onVideoOutput?: (track: MediaStreamTrack) => void;
  onVideoEnded?: () => void;
  onEffectsStatus?: (status: VideoEffectsStatus) => void;

  constructor(private createProcessor: VideoProcessorFactory = async (source, onStatus, onFailure) => {
    const { LiveVideoEffects } = await import('../video-effects/processor');
    return new LiveVideoEffects(source, onStatus, onFailure);
  }) {}

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
    if (kind === 'video') {
      this.camera = acquired.getVideoTracks()[0] || null;
      if (this.camera) this.camera.onended = () => { this.disable('video'); this.onVideoEnded?.(); };
      void this.applyEffects();
    }
  }

  disable(kind: 'audio' | 'video'): void {
    if (kind === 'video') {
      this.stopProcessor();
      if (this.camera) { this.camera.onended = null; this.camera.stop(); this.camera = null; }
      this.onEffectsStatus?.({ phase: 'off', progress: 0, message: '' });
    }
    for (const track of this.stream.getTracks().filter((track) => track.kind === kind)) {
      track.stop();
      this.stream.removeTrack(track);
    }
  }

  setEffects(settings: VideoEffectsSettings): void {
    this.settings = { ...settings };
    void this.applyEffects();
  }

  private stopProcessor(): void {
    this.effectGeneration += 1;
    this.processor?.dispose(); this.processor = null; this.processing = false;
  }

  private outputVideo(track: MediaStreamTrack): void {
    for (const previous of this.stream.getVideoTracks()) this.stream.removeTrack(previous);
    this.stream.addTrack(track);
    this.onVideoOutput?.(track);
  }

  private async applyEffects(): Promise<void> {
    const camera = this.camera;
    if (this.disposed || !camera || camera.readyState !== 'live') return;
    if (!effectsEnabled(this.settings)) {
      this.stopProcessor(); this.outputVideo(camera);
      this.onEffectsStatus?.({ phase: 'off', progress: 0, message: '' });
      return;
    }
    if (this.processor) { this.processor.configure(this.settings); return; }
    if (this.processing) return;
    this.processing = true;
    const generation = ++this.effectGeneration;
    const current = () => !this.disposed && generation === this.effectGeneration && this.camera === camera && camera.readyState === 'live';
    const failed = () => {
      if (!current()) return;
      this.stopProcessor(); this.outputVideo(camera);
      this.onEffectsStatus?.({ phase: 'error', progress: 0, message: '效果暂不可用，已恢复原画' });
    };
    this.onEffectsStatus?.({ phase: 'loading', progress: 0, message: '准备效果' });
    try {
      const processor = await this.createProcessor(camera, status => { if (current()) this.onEffectsStatus?.(status); }, failed);
      if (!current()) { processor.dispose(); return; }
      this.processor = processor; processor.configure(this.settings);
      const track = await processor.start();
      if (!current()) { processor.dispose(); return; }
      this.processing = false;
      this.outputVideo(track);
    } catch { failed(); }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.disable('audio');
    this.disable('video');
  }
}
