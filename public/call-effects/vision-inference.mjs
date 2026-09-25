// Shared by the classic Worker and the compatibility path. Media stays on-device.
const ROOT = '/mediapipe/0.10.35';

export class VisionInference {
  face = null;
  segmenter = null;
  canvases = [];
  closed = false;

  async configure({ faceModel, segmentModel }) {
    const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import(`${ROOT}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${ROOT}/wasm`);
    const create = async (Task, model, options) => {
      if (this.closed) throw new Error('画面处理已取消');
      const canvas = typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
      this.canvases.push(canvas);
      const base = { canvas, runningMode: 'VIDEO', ...options };
      // Keep GPU shader compilation off the UI thread. The compatibility path
      // uses WASM/SIMD CPU inference instead of synchronously compiling GPU kernels.
      const delegate = typeof document === 'undefined' ? 'GPU' : 'CPU';
      const task = await Task.createFromOptions(fileset, { ...base, baseOptions: { modelAssetBuffer: model, delegate } })
        .catch(() => {
          if (this.closed) throw new Error('画面处理已取消');
          return Task.createFromOptions(fileset, { ...base, baseOptions: { modelAssetBuffer: model, delegate: 'CPU' } });
        });
      if (this.closed) { task.close(); throw new Error('画面处理已取消'); }
      return task;
    };
    if (faceModel && !this.face) this.face = await create(FaceLandmarker, faceModel, { numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false });
    if (segmentModel && !this.segmenter) this.segmenter = await create(ImageSegmenter, segmentModel, { outputConfidenceMasks: true, outputCategoryMask: false });
  }

  infer(image, timestamp, needsFace, needsMask) {
    const started = performance.now();
    let face = new Float32Array(0), mask;
    if (needsMask && this.segmenter) this.segmenter.segmentForVideo(image, timestamp, result => {
      // The binary selfie model exposes foreground confidence in its sole mask.
      const foreground = result.confidenceMasks?.[0];
      if (!foreground) throw new Error('人物分割没有返回结果');
      const values = foreground.getAsFloat32Array();
      const data = new Uint8Array(values.length);
      for (let i = 0; i < values.length; i++) data[i] = Math.round(Math.max(0, Math.min(1, values[i])) * 255);
      mask = { data, width: foreground.width, height: foreground.height };
    });
    if (needsFace && this.face) {
      const points = this.face.detectForVideo(image, timestamp).faceLandmarks[0];
      if (points) {
        face = new Float32Array(points.length * 3);
        points.forEach((point, index) => { face[index * 3] = point.x; face[index * 3 + 1] = point.y; face[index * 3 + 2] = point.z; });
      }
    }
    return { face, mask, timestamp, inferenceMs: performance.now() - started };
  }

  close() {
    this.closed = true;
    for (const task of [this.face, this.segmenter]) { try { task?.close(); } catch { /* lost context */ } }
    this.face = this.segmenter = null;
    for (const canvas of this.canvases) {
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width = canvas.height = 0;
    }
    this.canvases = [];
  }
}
