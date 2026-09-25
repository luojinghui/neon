const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { File } = require('node:buffer');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: id => dependencies[id] || require(path.resolve(path.dirname(path.join(root, file)), id)), Float32Array, Uint8Array, Uint16Array, File, setTimeout, clearTimeout, performance, ...globals });
  return module.exports;
}
const types = load('src/modules/video-effects/types.ts');
const mesh = load('src/modules/video-effects/faceMesh.ts');
const { clipboardImages } = load('src/lib/clipboardImages.ts');

test('native clipboard representations do not duplicate images; unnamed and missing MIME files normalize', () => {
  const file = new File(['png'], 'capture.png', { type: 'image/png' });
  const unnamed = new File(['jpg'], '', { type: 'image/jpeg' });
  const images = clipboardImages({ items: [file, unnamed].map(file => ({ kind: 'file', getAsFile: () => file })), files: [file, unnamed], getData: () => '' });
  assert.equal(images.length, 2); assert.match(images[1].name, /\.jpg$/); assert.equal(images[1].type, 'image/jpeg');
  const missing = clipboardImages({ items: [], files: [new File(['png'], 'screenshot.PNG')], getData: () => '' });
  assert.equal(missing[0].type, 'image/png');
  assert.equal(clipboardImages({ items: [], files: [], getData: () => '' }).length, 0, 'plain text stays native');
});

test('face mesh has a complete 468-vertex surface; prediction is bounded and lost faces disappear', () => {
  assert.equal(mesh.FACE_UV.length, 468 * 2);
  assert.ok(mesh.FACE_TRIANGLES.length > 898 * 3, 'eyes and mouth are covered too');
  assert.ok(mesh.FACE_TRIANGLES.every(index => index < 468));
  const tracker = new mesh.FaceTracker();
  tracker.update(new Float32Array([.3, .4, 0]), 10);
  tracker.update(new Float32Array([.35, .4, 0]), 43);
  assert.ok(tracker.sample(90)[0] <= .369, 'prediction cannot overshoot by more than 1.8%');
  assert.equal(tracker.sample(300).length, 0, 'stale face overlays expire');
  tracker.update(new Float32Array(), 310);
  assert.equal(tracker.sample(311).length, 0);
  tracker.update(new Float32Array([1, 1, 1]), 200);
  assert.equal(tracker.sample(312).length, 0, 'out-of-order results cannot resurrect a lost face');
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let now = 0;
  const frames = [], modelRequests = [], status = [], failures = [];
  const source = { readyState: 'live' };
  const processed = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0, style: {}, setAttribute() {}, play: async () => {}, pause() {}, remove() {}, requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {} };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), captureStream: () => ({ getVideoTracks: () => [processed], getTracks: () => [processed] }) };
  let renderer, inference;
  class Renderer {
    canvas = canvas; draws = 0; masks = 0;
    constructor() { renderer = this; }
    hasAsset() { return true; }
    render() { this.draws++; }
    updateMask() { this.masks++; }
    clearMask() {}
    dispose() { this.disposed = true; }
  }
  class Inference {
    backend = 'worker';
    constructor() { inference = this; }
    async configure() {}
    infer(input, timestamp, face, mask) { const pending = deferred(); frames.push({ ...pending, timestamp, face, mask }); return pending.promise; }
    close() { this.closed = true; }
  }
  const { LiveVideoEffects } = load('src/modules/video-effects/processor.ts', {
    './types': types, './faceMesh': mesh, './renderer': { CallRenderer: Renderer }, './inference': { VideoInference: Inference },
    '@/app/doodle/visionRuntime': { prepareVisionCache: async () => {}, visionAsset: async name => { modelRequests.push(name); return new Uint8Array([1]); } }
  }, { performance: { now: () => now }, document: { createElement: tag => tag === 'video' ? video : canvas, body: { appendChild() {} } }, MediaStream: class {}, requestAnimationFrame() {}, cancelAnimationFrame() {} });
  const processor = new LiveVideoEffects(source, value => status.push(value), error => failures.push(error));
  return { processor, frames, modelRequests, status, failures, processed, source, get renderer() { return renderer; }, get inference() { return inference; }, advance(time) { now = time; processor.draw(time); } };
}

test('rendering keeps advancing during inference, with one frame in flight and no unnecessary models', async () => {
  const f = fixture(); f.processor.configure({ ...types.DEFAULT_VIDEO_EFFECTS, sticker2d: 'hearts' }); await f.processor.start();
  assert.deepEqual(f.modelRequests, ['face_landmarker.task']);
  for (const time of [34, 68, 102]) f.advance(time);
  assert.equal(f.renderer.draws, 4); assert.equal(f.frames.length, 1, 'no inference queue');
  f.frames[0].resolve({ face: new Float32Array(468 * 3), timestamp: 0, inferenceMs: 25 }); await flush();
  f.advance(136); assert.equal(f.frames.length, 2, 'next frame uses the latest camera image');
  f.processor.dispose();
  f.frames[1].resolve({ face: new Float32Array(), mask: { data: new Uint8Array([255]), width: 1, height: 1 }, timestamp: 136, inferenceMs: 20 }); await flush();
  assert.equal(f.renderer.masks, 0, 'late output does not touch a disposed renderer');
  assert.equal(f.processed.readyState, 'ended'); assert.equal(f.source.readyState, 'live'); assert.equal(f.inference.closed, true); assert.deepEqual(f.failures, []);
});

test('background-only loads the small segmenter and drops old-setting masks without pausing video', async () => {
  const f = fixture(); f.processor.configure({ ...types.DEFAULT_VIDEO_EFFECTS, background: 'cosmos' }); await f.processor.start();
  assert.deepEqual(f.modelRequests, ['selfie_segmenter_landscape.tflite']);
  assert.equal(f.frames[0].face, false);
  f.processor.configure({ ...types.DEFAULT_VIDEO_EFFECTS, sticker2d: 'hearts' }); await flush();
  f.frames[0].resolve({ face: new Float32Array(), mask: { data: new Uint8Array([255]), width: 1, height: 1 }, timestamp: 0, inferenceMs: 15 }); await flush();
  assert.equal(f.renderer.masks, 0);
  f.advance(40); assert.equal(f.frames[1].mask, false); assert.equal(f.frames[1].face, true);
  f.processor.dispose();
});
