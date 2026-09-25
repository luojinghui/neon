import { visionAsset, prepareVisionCache } from '@/app/doodle/visionRuntime';
import manifest from '../../../public/mediapipe/0.10.35/manifest.json';
import { DEFAULT_VIDEO_EFFECTS, type VideoEffectsSettings, type VideoEffectsStatus, type VideoProcessor } from './types';
import { VideoInference, type VisionModels } from './inference';
import { CallRenderer } from './renderer';
import { FaceTracker } from './faceMesh';

const needsFace = (s: VideoEffectsSettings) => s.sticker2d !== 'none' || s.faceEffect !== 'none' || s.whitening > 0 || s.smoothing > 0;

/** Caller owns the camera. Render new frames independently of single-flight inference. */
export class LiveVideoEffects implements VideoProcessor {
  private readonly video = document.createElement('video');
  private readonly input = document.createElement('canvas');
  private readonly tracker = new FaceTracker();
  private inference: VideoInference | null = null;
  private renderer: CallRenderer | null = null;
  private outputStream: MediaStream | null = null;
  private settings = { ...DEFAULT_VIDEO_EFFECTS };
  private disposed = false;
  private initialized = false;
  private ready = false;
  private revision = 0;
  private preparedRevision = -1;
  private preparing: Promise<void> | null = null;
  private models: VisionModels = {};
  private inFlight = false;
  private lastInference = -Infinity;
  private inferenceMs = 0;
  private interval = 1000 / 30;
  private maskTime = -Infinity;
  private videoFrame: number | undefined;
  private animationFrame: number | undefined;
  private previousTime = -1;
  private lastRender = -Infinity;
  private renderedFrames = 0;
  private metricsAt = 0;
  private cameraWaitCancel?: () => void;
  private status: VideoEffectsStatus = { phase: 'loading', progress: 0, message: '准备效果' };

  constructor(private source: MediaStreamTrack, private onStatus: (status: VideoEffectsStatus) => void, private onFailure: (error: unknown) => void) {
    this.video.muted = true; this.video.playsInline = true; this.video.setAttribute('playsinline', '');
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none';
    this.video.srcObject = new MediaStream([source]);
  }

  configure(settings: VideoEffectsSettings): void {
    if (this.disposed) return;
    if ((settings.background === 'original') !== (this.settings.background === 'original')) { this.maskTime = -Infinity; this.renderer?.clearMask(); }
    this.settings = { ...settings }; this.revision++;
    if (this.initialized) void this.prepare().catch(error => { if (!this.disposed) this.onFailure(error); });
  }
  private ensureAlive() { if (this.disposed || this.source.readyState !== 'live') throw new Error('画面处理已取消'); }
  private report(patch: Partial<VideoEffectsStatus>) {
    if (!this.disposed) { this.status = { ...this.status, ...patch }; this.onStatus(this.status); }
  }

  private prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.ready = false;
    this.preparing = (async () => {
      while (this.preparedRevision !== this.revision) {
        this.ensureAlive();
        const revision = this.revision, settings = this.settings;
        const names = [needsFace(settings) && !this.models.faceModel ? 'face_landmarker.task' : '', settings.background !== 'original' && !this.models.segmentModel ? 'selfie_segmenter_landscape.tflite' : ''].filter(Boolean);
        if (names.length) {
          this.report({ phase: 'loading', progress: 0, message: '加载画面资源' });
          await prepareVisionCache(); this.ensureAlive();
          const totals = names.map(name => (manifest.files as Record<string, { bytes: number }>)[name].bytes), loaded = names.map(() => 0);
          const models = await Promise.all(names.map((name, index) => visionAsset(name, bytes => {
            loaded[index] = Math.min(totals[index], bytes);
            this.report({ progress: Math.round(loaded.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0) * 80) });
          })));
          this.ensureAlive();
          names.forEach((name, index) => { if (name === 'face_landmarker.task') this.models.faceModel = models[index]; else this.models.segmentModel = models[index]; });
          this.report({ progress: 85, message: '启动画面处理' });
          // Include loaded models so a failed worker can rebuild the complete fallback.
          await this.inference!.configure(this.models); this.ensureAlive();
        }
        const assets = [settings.sticker2d !== 'none' ? settings.sticker2d : '', ['sunroom', 'hills', 'grid'].includes(settings.background) ? settings.background : ''].filter(name => name && !this.renderer!.hasAsset(name));
        await Promise.all(assets.map(async name => {
          const image = new Image(); image.src = `/call-effects/${name}.svg`; await image.decode(); this.ensureAlive(); this.renderer!.setAsset(name, image);
        }));
        this.preparedRevision = revision;
      }
      this.ready = true;
      this.report({ phase: 'ready', progress: 100, message: '', backend: this.inference!.backend });
    })().finally(() => { this.preparing = null; });
    return this.preparing;
  }

  async start(): Promise<MediaStreamTrack> {
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
    const sourceWidth = this.video.videoWidth || 640, sourceHeight = this.video.videoHeight || 480;
    const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    this.renderer = new CallRenderer(Math.round(sourceWidth * scale), Math.round(sourceHeight * scale));
    this.inference = new VideoInference(); this.initialized = true;
    await this.prepare(); this.ensureAlive();
    const canvas = this.renderer.canvas;
    if (typeof canvas.captureStream !== 'function') throw new Error('此浏览器暂不支持画面效果');
    this.outputStream = canvas.captureStream(30);
    const track = this.outputStream.getVideoTracks()[0];
    if (!track) throw new Error('画面效果暂不可用');
    this.metricsAt = performance.now();
    this.draw(this.metricsAt); this.schedule();
    return track;
  }

  private schedule() {
    if (this.disposed) return;
    const next = (now: number) => {
      if (this.disposed) return;
      try {
        if (this.video.readyState >= 2 && this.video.currentTime !== this.previousTime && (typeof this.video.requestVideoFrameCallback === 'function' || now - this.lastRender >= 1000 / 32)) {
          this.previousTime = this.video.currentTime; this.lastRender = now; this.draw(now);
        }
        this.schedule();
      } catch (error) { this.onFailure(error); }
    };
    if (typeof this.video.requestVideoFrameCallback === 'function') this.videoFrame = this.video.requestVideoFrameCallback(next);
    else this.animationFrame = requestAnimationFrame(next);
  }

  private draw(now: number) {
    this.ensureAlive();
    this.renderer!.render(this.video, this.settings, this.tracker.sample(now), now);
    this.renderedFrames++;
    if (now - this.metricsAt >= 1000) {
      this.report({ fps: Math.round(this.renderedFrames * 1000 / (now - this.metricsAt)), inferenceMs: Math.round(this.inferenceMs), maskAgeMs: Number.isFinite(this.maskTime) ? Math.round(now - this.maskTime) : undefined });
      this.renderedFrames = 0; this.metricsAt = now;
    }
    if (!this.ready || this.inFlight || now - this.lastInference < this.interval) return;
    const face = needsFace(this.settings), mask = this.settings.background !== 'original';
    if (!face && !mask) return;
    this.inFlight = true; this.lastInference = now;
    const revision = this.revision;
    // Downsample inference only; transmitted video keeps its original output resolution.
    const longestEdge = this.inferenceMs > 35 ? 256 : 320;
    const scale = longestEdge / Math.max(this.video.videoWidth, this.video.videoHeight);
    const width = Math.round(this.video.videoWidth * scale), height = Math.round(this.video.videoHeight * scale);
    if (this.input.width !== width || this.input.height !== height) { this.input.width = width; this.input.height = height; }
    this.input.getContext('2d', { alpha: false })!.drawImage(this.video, 0, 0, width, height);
    void this.inference!.infer(this.input, now, face, mask).then(result => {
      if (this.disposed) return;
      this.inferenceMs = result.inferenceMs;
      this.interval = Math.max(this.inference!.backend === 'main' ? 50 : 1000 / 30, Math.min(66, result.inferenceMs * 1.1));
      // Drop stale/configuration-mismatched results rather than painting old silhouettes.
      if (revision !== this.revision || performance.now() - result.timestamp > 200) return;
      if (face) {
        this.tracker.update(result.face, result.timestamp);
        const detected = result.face.length > 0;
        if (this.status.faceDetected !== detected) this.report({ faceDetected: detected });
      }
      if (result.mask) { this.renderer!.updateMask(result.mask, result.timestamp); this.maskTime = result.timestamp; }
    }).catch(error => { if (!this.disposed) this.onFailure(error); }).finally(() => { this.inFlight = false; });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.cameraWaitCancel?.();
    if (this.videoFrame !== undefined) this.video.cancelVideoFrameCallback(this.videoFrame);
    if (this.animationFrame !== undefined) cancelAnimationFrame(this.animationFrame);
    this.outputStream?.getTracks().forEach(track => track.stop()); this.outputStream = null;
    this.video.pause(); this.video.srcObject = null; this.video.remove();
    this.inference?.close(); this.inference = null;
    this.renderer?.dispose(); this.renderer = null;
    this.input.width = this.input.height = 0; this.models = {};
  }
}
