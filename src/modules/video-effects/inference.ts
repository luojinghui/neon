export type InferenceResult = {
  face: Float32Array;
  mask?: { data: Uint8Array; width: number; height: number };
  timestamp: number;
  inferenceMs: number;
};
export type VisionModels = { faceModel?: Uint8Array; segmentModel?: Uint8Array };
interface Runtime {
  configure(models: VisionModels): Promise<void>;
  infer(image: HTMLCanvasElement, timestamp: number, face: boolean, mask: boolean): InferenceResult;
  close(): void;
}

/** One frame in flight. Configuration is serialized by the worker, never queued video. */
export class VideoInference {
  backend: 'worker' | 'main' = 'worker';
  private worker: Worker | null = null;
  private runtime: Runtime | null = null;
  private id = 0;
  private closed = false;
  private pending = new Map<number, { resolve: (value: InferenceResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor() {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') { this.backend = 'main'; return; }
    try {
      this.worker = new Worker('/call-effects/vision-worker.js');
      this.worker.onmessage = ({ data }) => {
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id); clearTimeout(request.timer);
        if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
      };
      this.worker.onerror = event => { event.preventDefault(); this.stopWorker(new Error('后台画面处理暂不可用')); };
    } catch { this.backend = 'main'; }
  }

  private request(data: object, transfer: Transferable[] = []): Promise<InferenceResult> {
    if (this.closed || !this.worker) return Promise.reject(new Error('画面处理已取消'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('画面处理超时，请重试')); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker!.postMessage({ ...data, id }, transfer); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }

  async configure(models: VisionModels) {
    if (this.closed) throw new Error('画面处理已取消');
    if (this.worker) {
      try { await this.request({ type: 'configure', models }); return; }
      catch (error) { this.stopWorker(error instanceof Error ? error : new Error('Worker unavailable')); }
    }
    if (this.closed) throw new Error('画面处理已取消');
    this.backend = 'main';
    if (!this.runtime) {
      const url = '/call-effects/vision-inference.mjs';
      const { VisionInference } = await import(/* webpackIgnore: true */ url);
      if (this.closed) throw new Error('画面处理已取消');
      this.runtime = new VisionInference() as Runtime;
    }
    await this.runtime.configure(models);
  }

  async infer(input: HTMLCanvasElement, timestamp: number, face: boolean, mask: boolean) {
    if (this.closed) throw new Error('画面处理已取消');
    if (!this.worker) return this.runtime!.infer(input, timestamp, face, mask);
    const bitmap = await createImageBitmap(input);
    if (this.closed || !this.worker) { bitmap.close(); throw new Error('画面处理已取消'); }
    try { return await this.request({ type: 'frame', bitmap, timestamp, face, mask }, [bitmap]); }
    finally { bitmap.close(); }
  }

  private stopWorker(error: Error) {
    this.worker?.terminate(); this.worker = null;
    this.pending.forEach(request => { clearTimeout(request.timer); request.reject(error); }); this.pending.clear();
  }
  close() { this.closed = true; this.stopWorker(new Error('画面处理已取消')); this.runtime?.close(); this.runtime = null; }
}
