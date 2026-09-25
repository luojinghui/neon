import type { FilesetResolver } from '@mediapipe/tasks-vision';

export const VISION_ROOT = '/mediapipe/0.10.35';
const CACHE = 'neon-vision-0.10.35-v1';
let ready: Promise<void> | undefined;
let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | undefined;
const models = new Map<string, Promise<Uint8Array>>();
type Progress = (loaded: number, total: number) => void;
const resources = new Map<string, { promise: Promise<Uint8Array>; listeners: Set<Progress>; loaded: number; total: number }>();

export function prepareVisionCache() {
  return ready ||= (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      await navigator.serviceWorker.register('/vision-sw.js', { scope: '/', updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 1800))]);
    } catch { /* In-app browsers may disable Service Workers; HTTP caching remains available. */ }
  })();
}

export async function visionFileset() {
  await prepareVisionCache();
  if (!fileset) {
    const { FilesetResolver } = await import('@mediapipe/tasks-vision');
    fileset = FilesetResolver.forVisionTasks(`${VISION_ROOT}/wasm`).catch(error => { fileset = undefined; throw error; });
  }
  return fileset;
}

export function visionAsset(name: string, onProgress?: Progress): Promise<Uint8Array> {
  if (!/^(?:wasm\/vision_wasm_(?:nosimd_|module_)?internal\.(?:js|wasm)|face_landmarker\.task|selfie_(?:multiclass|segmenter_landscape)\.tflite)$/.test(name)) return Promise.reject(new Error('未知的人像资源'));
  let resource = resources.get(name);
  if (!resource) {
    const entry = { promise: Promise.resolve(new Uint8Array()), listeners: new Set<Progress>(), loaded: 0, total: 0 };
    resource = entry;
    resources.set(name, entry);
    entry.promise = (async () => {
      await prepareVisionCache();
      const url = `${VISION_ROOT}/${name}`;
      let cache: Cache | undefined;
      try { cache = await caches.open(CACHE); } catch { /* Optional persistent cache. */ }
      const cached = await cache?.match(url).catch(() => undefined);
      const response = cached || await fetch(url);
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('人像资源暂时无法加载，请稍后重试');
      const copy = !cached && cache ? response.clone() : null;
      entry.total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      if (reader) {
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            chunks.push(result.value); entry.loaded += result.value.length;
            entry.listeners.forEach(listener => listener(entry.loaded, entry.total));
          }
        } finally { reader.releaseLock(); }
      } else { const bytes = new Uint8Array(await response.arrayBuffer()); chunks.push(bytes); entry.loaded = bytes.length; }
      const bytes = new Uint8Array(entry.loaded); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      entry.total = entry.loaded;
      entry.listeners.forEach(listener => listener(entry.loaded, entry.total));
      if (copy && cache) await cache.put(url, copy).catch(() => {});
      return bytes;
    })().catch(error => { resources.delete(name); throw error; });
  }
  const current = resource;
  if (onProgress) { current.listeners.add(onProgress); onProgress(current.loaded, current.total); }
  return current.promise.finally(() => { if (onProgress) current.listeners.delete(onProgress); });
}

export function visionModel(name: 'face_landmarker.task' | 'selfie_multiclass.tflite') {
  if (!models.has(name)) models.set(name, visionAsset(name).catch(error => { models.delete(name); throw error; }));
  return models.get(name)!;
}
