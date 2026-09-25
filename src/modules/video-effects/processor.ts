import type { FaceLandmarker, ImageSegmenter, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { visionAsset, visionFileset, VISION_ROOT } from '@/app/doodle/visionRuntime';
import { PortraitRenderer } from '@/app/doodle/portrait/renderer';
import { DEFAULT_PORTRAIT, type PortraitSettings } from '@/app/doodle/portrait/settings';
import { faceTriangles } from '@/app/doodle/portrait/faceMesh';
import { DEFAULT_VIDEO_EFFECTS, FLAT_STICKERS, type VideoEffectsSettings, type VideoEffectsStatus, type VideoProcessor } from './types';
import manifest from '../../../public/mediapipe/0.10.35/manifest.json';

export function stickerPlacement(face: NormalizedLandmark[], width: number, height: number) {
  const left = face[33], right = face[263], cheekLeft = face[234], cheekRight = face[454];
  if (!left || !right || !cheekLeft || !cheekRight) return null;
  const size = Math.hypot((cheekRight.x - cheekLeft.x) * width, (cheekRight.y - cheekLeft.y) * height);
  return { x: (left.x + right.x) * width / 2, y: (left.y + right.y) * height / 2 + size * .20, width: size * 1.1, height: size * 1.1 * 140 / 360, angle: Math.atan2((right.y - left.y) * height, (right.x - left.x) * width) };
}

/** Only consumes a caller-owned camera track. It never requests device access. */
export class LiveVideoEffects implements VideoProcessor {
  private readonly video = document.createElement('video');
  private readonly input = document.createElement('canvas');
  private readonly output = document.createElement('canvas');
  private readonly images = new Map<string, HTMLImageElement>();
  private renderer: PortraitRenderer | null = null;
  private landmarker: FaceLandmarker | null = null;
  private segmenter: ImageSegmenter | null = null;
  private settings = { ...DEFAULT_VIDEO_EFFECTS };
  private disposed = false;
  private outputStream: MediaStream | null = null;
  private frame: ReturnType<typeof setTimeout> | undefined;
  private lastInference = -Infinity;
  private inferenceInterval = 100;
  private backdrop = '';
  private previousTime = -1;
  private faceDetected: boolean | undefined;
  private cameraWaitCancel: (() => void) | undefined;
  private status: VideoEffectsStatus = { phase: 'loading', progress: 0, message: '准备效果' };

  constructor(private source: MediaStreamTrack, private onStatus: (status: VideoEffectsStatus) => void, private onFailure: (error: unknown) => void) {
    this.video.muted = true; this.video.playsInline = true;
    this.video.srcObject = new MediaStream([source]);
  }

  configure(settings: VideoEffectsSettings): void { this.settings = { ...settings }; }
  private ensureAlive() { if (this.disposed || this.source.readyState !== 'live') throw new Error('画面处理已取消'); }
  private report(patch: Partial<VideoEffectsStatus>) {
    if (this.disposed) return;
    this.status = { ...this.status, ...patch }; this.onStatus(this.status);
  }

  async start(): Promise<MediaStreamTrack> {
    this.report({ phase: 'loading', progress: 0, message: '加载画面效果' });
    await this.video.play(); this.ensureAlive();
    if (this.video.readyState < 2) await new Promise<void>((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('摄像头画面暂不可用')); }, 8000);
      const cleanup = () => { clearTimeout(timer); this.video.removeEventListener('loadeddata', done); this.cameraWaitCancel = undefined; };
      this.cameraWaitCancel = () => { cleanup(); reject(new Error('画面处理已取消')); };
      this.video.addEventListener('loadeddata', done, { once: true });
    });
    this.ensureAlive();
    this.input.width = this.output.width = Math.min(640, this.video.videoWidth || 640);
    this.input.height = this.output.height = Math.round(this.input.width * (this.video.videoHeight || 480) / (this.video.videoWidth || 640));
    this.renderer = new PortraitRenderer(this.input);
    const { FaceLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision'); this.ensureAlive();
    const fileset = await visionFileset(); this.ensureAlive();
    const wasmName = fileset.wasmBinaryPath.slice(VISION_ROOT.length + 1);
    const names = [wasmName, 'face_landmarker.task', 'selfie_multiclass.tflite'];
    const totals = names.map(name => (manifest.files as Record<string, { bytes: number }>)[name]?.bytes || 0);
    const loaded = names.map(() => 0), total = totals.reduce((sum, n) => sum + n, 0);
    const [wasm, faceModel, segmentModel] = await Promise.all(names.map((name, index) => visionAsset(name, (bytes) => {
      loaded[index] = Math.min(totals[index], bytes);
      this.report({ progress: Math.round(loaded.reduce((sum, n) => sum + n, 0) / Math.max(total, 1) * 80), message: '加载画面资源' });
    })));
    this.ensureAlive();
    const wasmUrl = URL.createObjectURL(new Blob([new Uint8Array(wasm)], { type: 'application/wasm' }));
    try {
      const localFileset = { ...fileset, wasmBinaryPath: wasmUrl };
      this.report({ progress: 82, message: '启动人脸追踪' });
      const faceOptions = { baseOptions: { modelAssetBuffer: faceModel, delegate: 'GPU' as const }, runningMode: 'VIDEO' as const, numFaces: 1 };
      const face = await FaceLandmarker.createFromOptions(localFileset, faceOptions).catch(() => {
        this.ensureAlive();
        return FaceLandmarker.createFromOptions(localFileset, { ...faceOptions, baseOptions: { modelAssetBuffer: faceModel, delegate: 'CPU' } } );
      });
      if (this.disposed) { face.close(); this.ensureAlive(); }
      this.landmarker = face;
      this.report({ progress: 90, message: '启动人物分割' });
      const segmentOptions = { canvas: this.renderer!.canvas, baseOptions: { modelAssetBuffer: segmentModel, delegate: 'GPU' as const }, runningMode: 'VIDEO' as const, outputConfidenceMasks: true, outputCategoryMask: false };
      const segmenter = await ImageSegmenter.createFromOptions(localFileset, segmentOptions).catch(() => {
        this.ensureAlive();
        return ImageSegmenter.createFromOptions(localFileset, { ...segmentOptions, baseOptions: { modelAssetBuffer: segmentModel, delegate: 'CPU' } });
      });
      if (this.disposed) { segmenter.close(); this.ensureAlive(); }
      this.segmenter = segmenter;
      this.renderer!.faceTriangles = faceTriangles(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
      this.report({ progress: 96, message: '准备贴纸' });
      await Promise.all([...FLAT_STICKERS.filter(item => item.id !== 'none').map(item => item.id), 'sunroom', 'hills', 'grid'].map(async (name) => {
        const image = new Image(); image.src = `/call-effects/${name}.svg`; await image.decode(); this.ensureAlive(); this.images.set(name, image);
      }));
      this.ensureAlive();
      this.draw(performance.now());
      if (typeof this.output.captureStream !== 'function') throw new Error('此浏览器暂不支持画面效果');
      this.outputStream = this.output.captureStream(24);
      const track = this.outputStream.getVideoTracks()[0];
      if (!track) throw new Error('画面效果暂不可用');
      this.report({ phase: 'ready', progress: 100, message: '', faceDetected: this.faceDetected });
      this.schedule();
      return track;
    } finally { URL.revokeObjectURL(wasmUrl); }
  }

  private schedule() {
    // Bound rendering and inference independently. Timers also work when the settings sheet is closed.
    this.frame = setTimeout(() => {
      if (this.disposed) return;
      try {
        if (this.video.readyState >= 2 && this.previousTime !== this.video.currentTime) { this.draw(performance.now()); this.previousTime = this.video.currentTime; }
        this.schedule();
      } catch (error) { this.onFailure(error); }
    }, 1000 / 24);
  }

  private draw(now: number) {
    this.ensureAlive();
    const renderer = this.renderer!;
    const input = this.input.getContext('2d', { alpha: false })!;
    input.drawImage(this.video, 0, 0, this.input.width, this.input.height);
    const settings = this.settings;
    if (now - this.lastInference >= this.inferenceInterval) {
      const started = performance.now();
      const needsFace = settings.faceEffect !== 'none' || settings.accessory !== 'none' || settings.sticker2d !== 'none' || settings.whitening > 0 || settings.smoothing > 0;
      renderer.updateFaces(needsFace ? this.landmarker!.detectForVideo(this.input, now).faceLandmarks : []);
      if (settings.whitening > 0 || settings.smoothing > 0 || settings.background !== 'original') this.segmenter!.segmentForVideo(this.input, now, result => renderer.captureMask(result));
      const detected = renderer.faces.length > 0;
      if (detected !== this.faceDetected) { this.faceDetected = detected; this.report({ faceDetected: detected }); }
      this.lastInference = now;
      this.inferenceInterval = Math.max(100, Math.min(500, (performance.now() - started) * 4));
    }
    if (this.backdrop !== settings.background) { renderer.setBackdrop(this.images.get(settings.background) || null); this.backdrop = settings.background; }
    renderer.updateSource(this.input);
    const portrait: PortraitSettings = {
      ...DEFAULT_PORTRAIT, whitening: settings.whitening, smoothing: settings.smoothing, cartoon: 0, outline: 0,
      faceEffect: settings.faceEffect, faceEffectStrength: 90, sticker: settings.accessory, stickerColor: settings.color,
      stickerScale: .8, stickerY: -.1,
      background: ['original', 'peach', 'cosmos', 'mint'].includes(settings.background) ? settings.background as PortraitSettings['background'] : 'original'
    };
    const output = this.output.getContext('2d', { alpha: false })!;
    output.drawImage(renderer.render(portrait, false), 0, 0);
    const sticker = this.images.get(settings.sticker2d), face = renderer.faces[0];
    if (sticker && face) {
      const placement = stickerPlacement(face, this.output.width, this.output.height);
      if (placement) {
        output.save(); output.translate(placement.x, placement.y); output.rotate(placement.angle);
        output.drawImage(sticker, -placement.width / 2, -placement.height / 2, placement.width, placement.height); output.restore();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.frame); this.cameraWaitCancel?.();
    this.outputStream?.getTracks().forEach(track => track.stop()); this.outputStream = null;
    this.video.pause(); this.video.srcObject = null;
    // One failed GPU cleanup must not prevent the remaining resources from being released.
    for (const task of [this.landmarker, this.segmenter, this.renderer]) {
      try { if (task instanceof PortraitRenderer) task.dispose(); else task?.close(); } catch { /* already lost GPU context */ }
    }
    this.landmarker = null; this.segmenter = null;
    this.renderer = null; this.images.clear();
    this.input.width = this.input.height = this.output.width = this.output.height = 0;
  }
}
