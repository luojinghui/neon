// Classic workers let MediaPipe's WASM loader use importScripts on Safari too.
let runtime;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (!runtime) {
        const { VisionInference } = await import('./vision-inference.mjs');
        runtime = new VisionInference();
      }
      if (data.type === 'configure') {
        await runtime.configure(data.models);
        self.postMessage({ id: data.id });
      } else if (data.type === 'frame') {
        const result = runtime.infer(data.bitmap, data.timestamp, data.face, data.mask);
        self.postMessage({ id: data.id, result }, [result.face.buffer, ...(result.mask ? [result.mask.data.buffer] : [])]);
      }
    } catch (error) {
      self.postMessage({ id: data.id, error: error instanceof Error ? error.message : '画面处理失败' });
    } finally { data.bitmap?.close(); }
  });
};
