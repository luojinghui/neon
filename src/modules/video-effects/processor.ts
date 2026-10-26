import { beautyFrameSize, DEFAULT_VIDEO_EFFECTS, normalizeVideoEffects, type VideoEffectsSettings, type VideoEffectsStatus, type VideoProcessor } from './types';
import { CallRenderer } from './renderer';

/** Uses only the caller-owned camera track. Beauty never requests device access. */
export class LiveVideoEffects implements VideoProcessor {
  private readonly video = document.createElement('video');
  private renderer: CallRenderer | null = null;
  private output: MediaStream | null = null;
  private starting: Promise<MediaStreamTrack> | null = null;
  private settings = { ...DEFAULT_VIDEO_EFFECTS };
  private disposed = false;
  private failed = false;
  private videoFrame: number | undefined;
  private animationFrame: number | undefined;
  private previousTime = -1;
  private lastRender = -Infinity;
  private metricsAt = 0;
  private renderedFrames = 0;
  private cameraWaitCancel?: () => void;

  constructor(private readonly source: MediaStreamTrack, private readonly onStatus: (status: VideoEffectsStatus) => void, private readonly onFailure: (error: unknown) => void) {
    this.video.muted = true; this.video.playsInline = true; this.video.setAttribute('playsinline', '');
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none';
    this.video.srcObject = new MediaStream([source]);
  }

  configure(settings: VideoEffectsSettings): void { if (!this.disposed) this.settings = normalizeVideoEffects(settings); }
  private ensureAlive(): void { if (this.disposed || this.source.readyState !== 'live') throw new Error('画面处理已取消'); }
  private fail(error: unknown): void {
    if (this.disposed || this.failed) return;
    this.failed = true;
    this.onFailure(error);
    this.dispose();
  }

  start(): Promise<MediaStreamTrack> {
    if (!this.starting) this.starting = this.initialize().catch(error => { this.dispose(); throw error; });
    return this.starting;
  }

  private async initialize(): Promise<MediaStreamTrack> {
    this.ensureAlive();
    this.onStatus({ phase: 'loading', progress: 0, message: '正在开启美颜' });
    document.body.appendChild(this.video);
    await this.video.play(); this.ensureAlive();
    if (this.video.readyState < 2) await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.video.removeEventListener('loadeddata', done); this.cameraWaitCancel = undefined; };
      const done = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('摄像头画面暂不可用')); }, 8000);
      this.cameraWaitCancel = () => { cleanup(); reject(new Error('画面处理已取消')); };
      this.video.addEventListener('loadeddata', done, { once: true });
    });
    this.ensureAlive();
    const size = beautyFrameSize(this.video.videoWidth, this.video.videoHeight);
    this.renderer = new CallRenderer(size.width, size.height, error => this.fail(error));
    const canvas = this.renderer.canvas;
    if (typeof canvas.captureStream !== 'function') throw new Error('此浏览器暂不支持美颜');
    this.output = canvas.captureStream(30);
    const track = this.output.getVideoTracks()[0];
    if (!track) throw new Error('美颜画面暂不可用');
    this.metricsAt = performance.now();
    this.render(this.metricsAt);
    this.onStatus({ phase: 'ready', progress: 100, message: '' });
    this.schedule();
    return track;
  }

  private schedule(): void {
    if (this.disposed || this.failed) return;
    const next = (now: number) => {
      if (this.disposed || this.failed) return;
      try {
        // One callback owns the render loop; slower devices simply use the latest frame.
        if (this.video.readyState >= 2 && this.video.currentTime !== this.previousTime && now - this.lastRender >= 1000 / 31) this.render(now);
        this.schedule();
      } catch (error) { this.fail(error); }
    };
    if (typeof this.video.requestVideoFrameCallback === 'function') this.videoFrame = this.video.requestVideoFrameCallback(next);
    else this.animationFrame = requestAnimationFrame(next);
  }

  private render(now: number): void {
    this.ensureAlive();
    const size = beautyFrameSize(this.video.videoWidth, this.video.videoHeight);
    this.renderer!.resize(size.width, size.height);
    this.renderer!.render(this.video, this.settings);
    this.previousTime = this.video.currentTime; this.lastRender = now; this.renderedFrames++;
    if (now - this.metricsAt >= 1000) {
      this.onStatus({ phase: 'ready', progress: 100, message: '', fps: Math.round(this.renderedFrames * 1000 / (now - this.metricsAt)) });
      this.renderedFrames = 0; this.metricsAt = now;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.cameraWaitCancel?.();
    if (this.videoFrame !== undefined) this.video.cancelVideoFrameCallback?.(this.videoFrame);
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.output?.getTracks().forEach(track => track.stop()); this.output = null;
    this.video.pause(); this.video.srcObject = null; this.video.remove();
    this.renderer?.dispose(); this.renderer = null;
  }
}
