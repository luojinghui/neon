import type { FilesetResolver } from '@mediapipe/tasks-vision';

export const VISION_ROOT = '/mediapipe/0.10.35';
const CACHE = 'neon-vision-0.10.35-v1';
let ready: Promise<void> | undefined;
let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | undefined;
const models = new Map<string, Promise<Uint8Array>>();

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

export function visionModel(name: 'face_landmarker.task' | 'selfie_multiclass.tflite') {
  if (!models.has(name)) models.set(name, (async () => {
    await prepareVisionCache();
    const url = `${VISION_ROOT}/${name}`;
    let cache: Cache | undefined;
    try { cache = await caches.open(CACHE); } catch { /* Optional persistent cache. */ }
    const cached = await cache?.match(url).catch(() => undefined);
    const response = cached || await fetch(url);
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('人像资源暂时无法加载，请稍后重试');
    if (!cached && cache) await cache.put(url, response.clone()).catch(() => {});
    return new Uint8Array(await response.arrayBuffer());
  })().catch(error => { models.delete(name); throw error; }));
  return models.get(name)!;
}
