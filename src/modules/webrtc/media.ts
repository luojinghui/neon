import { CameraTrack } from '../media-track/camera-track';
import type { TrackProcessor } from '../media-track/pipeline';
import { trackFrameSize } from '../media-track/simulcast';
import { callVideoEnabled, DEFAULT_CALL_VIDEO, type CallVideoProcessor, type CallVideoProcessorFactory, type CallVideoSettings } from '../virtual-background/settings';

export type { CallVideoSettings };

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

/** 每次只在用户操作后打开设备，关闭时释放硬件。视频采集交给 CameraTrack，效果通过处理链接入。 */
export class LocalMedia {
  readonly stream = new MediaStream();
  private generation = 0;
  private disposed = false;
  private cameraTrack: CameraTrack | null = null;
  private camera: MediaStreamTrack | null = null;
  private processor: CallVideoProcessor | null = null;
  private processing = false;
  private effectGeneration = 0;
  private settings: CallVideoSettings = { ...DEFAULT_CALL_VIDEO, background: { ...DEFAULT_CALL_VIDEO.background }, sticker: { ...DEFAULT_CALL_VIDEO.sticker }, avatar: { ...DEFAULT_CALL_VIDEO.avatar } };
  onVideoOutput?: (track: MediaStreamTrack, size: { width: number; height: number }) => void;
  onVideoEnded?: () => void;
  onEffectsStatus?: (status: { phase: 'off' | 'loading' | 'ready' | 'error'; progress: number; message: string }) => void;

  constructor(private createProcessor: CallVideoProcessorFactory = async (source, onStatus, onFailure) => {
    const { createVirtualCallProcessor } = await import('../virtual-background/call-processor');
    return createVirtualCallProcessor(source, onStatus, onFailure);
  }) {}

  videoSize(): { width: number; height: number } {
    return trackFrameSize(this.camera);
  }

  async enable(kind: 'audio' | 'video', facingMode: 'user' | 'environment' = 'user'): Promise<void> {
    if (this.disposed) return;
    const generation = this.generation;
    if (kind === 'audio') {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (this.disposed || generation !== this.generation) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      this.disable('audio');
      acquired.getTracks().forEach((track) => this.stream.addTrack(track));
      return;
    }
    const cameraTrack = new CameraTrack();
    let acquired: MediaStreamTrack;
    try {
      acquired = await cameraTrack.capture(facingMode);
    } catch (error) {
      cameraTrack.stop();
      throw error;
    }
    if (this.disposed || generation !== this.generation) {
      cameraTrack.stop();
      return;
    }
    this.disable('video');
    this.cameraTrack = cameraTrack;
    this.camera = acquired;
    acquired.onended = () => { this.disable('video'); this.onVideoEnded?.(); };
    this.stream.addTrack(acquired);
    void this.applyEffects();
  }

  disable(kind: 'audio' | 'video'): void {
    if (kind === 'video') {
      this.stopProcessor();
      if (this.camera) this.camera.onended = null;
      this.cameraTrack?.stop();
      this.cameraTrack = null;
      this.camera = null;
      this.onEffectsStatus?.({ phase: 'off', progress: 0, message: '' });
    }
    for (const track of this.stream.getTracks().filter((track) => track.kind === kind)) {
      track.stop();
      this.stream.removeTrack(track);
    }
  }

  setEffects(settings: CallVideoSettings): void {
    this.settings = settings;
    void this.applyEffects();
  }

  private stopProcessor(): void {
    this.effectGeneration += 1;
    this.processor?.dispose();
    this.processor = null;
    this.processing = false;
    this.cameraTrack?.pipeline.reset();
  }

  private outputVideo(track: MediaStreamTrack, size = trackFrameSize(this.camera)): void {
    for (const previous of this.stream.getVideoTracks()) this.stream.removeTrack(previous);
    this.stream.addTrack(track);
    this.onVideoOutput?.(track, size);
  }

  private async applyEffects(): Promise<void> {
    const camera = this.camera;
    const cameraTrack = this.cameraTrack;
    if (this.disposed || !camera || !cameraTrack || camera.readyState !== 'live') return;
    if (!callVideoEnabled(this.settings)) {
      this.stopProcessor();
      this.outputVideo(camera);
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
      this.stopProcessor();
      this.outputVideo(camera);
      this.onEffectsStatus?.({ phase: 'error', progress: 0, message: '效果暂不可用，已恢复原画' });
    };
    this.onEffectsStatus?.({ phase: 'loading', progress: 0, message: '准备效果' });
    try {
      const processor = await this.createProcessor(camera, status => { if (current()) this.onEffectsStatus?.(status); }, failed);
      if (!current()) { processor.dispose(); return; }
      this.processor = processor;
      const requested = this.settings;
      processor.configure(requested);
      const binding: TrackProcessor = { process: async (input) => ({ track: await processor.start(), width: input.width, height: input.height }) };
      cameraTrack.pipeline.reset();
      cameraTrack.connect(binding);
      const output = await cameraTrack.output();
      if (!current()) { processor.dispose(); return; }
      if (this.settings !== requested) processor.configure(this.settings);
      this.processing = false;
      this.outputVideo(output.track, { width: output.width, height: output.height });
    } catch { failed(); }
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.disable('audio');
    this.disable('video');
  }
}
