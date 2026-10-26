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
  vm.runInNewContext(outputText, { module, exports: module.exports, require: id => dependencies[id] || require(path.resolve(path.dirname(path.join(root, file)), id)), File, setTimeout, clearTimeout, performance, ...globals });
  return module.exports;
}
const types = load('src/modules/video-effects/types.ts');
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

test('beauty accepts only finite percentages and discards removed effects', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(types.normalizeVideoEffects({ whitening: Infinity, smoothing: -10, sticker2d: 'hearts', faceEffect: 'cat', background: 'cosmos' }))), { whitening: 0, smoothing: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(types.normalizeVideoEffects({ whitening: 150, smoothing: 39.8 }))), { whitening: 100, smoothing: 40 });
  assert.equal(types.effectsEnabled(types.DEFAULT_VIDEO_EFFECTS), false);
  assert.equal(types.effectsEnabled({ whitening: 0, smoothing: 1 }), true);
});

test('output preserves landscape/portrait aspect ratio within the mobile pixel budget', () => {
  for (const [width, height, expected] of [[1920, 1080, [640, 360]], [1080, 1920, [360, 640]], [320, 240, [320, 240]], [0, 0, [640, 480]], [Infinity, 300, [640, 480]]]) {
    const result = types.beautyFrameSize(width, height);
    assert.deepEqual([result.width, result.height], expected);
  }
});

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(options = {}) {
  let now = 0, id = 0, renderer;
  const callbacks = new Map(), events = new Map(), status = [], failures = [];
  const source = { readyState: 'live', stop() { throw Error('caller-owned source must never be stopped'); } };
  const processed = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const video = { readyState: options.waitForFrame ? 0 : 2, videoWidth: 1280, videoHeight: 720, currentTime: 0, style: {},
    setAttribute() {}, play: () => options.play || Promise.resolve(), pause() { this.paused = true; }, remove() { this.removed = true; },
    addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name) { events.delete(name); },
    requestVideoFrameCallback(callback) { callbacks.set(++id, callback); return id; }, cancelVideoFrameCallback(value) { callbacks.delete(value); } };
  if (options.fallback) delete video.requestVideoFrameCallback;
  const canvas = { captureStream: options.noCapture ? undefined : () => ({ getVideoTracks: () => [processed], getTracks: () => [processed] }) };
  class Renderer {
    canvas = canvas; draws = []; resizes = [];
    constructor(width, height, failed) { renderer = this; this.size = [width, height]; this.failed = failed; }
    render(video, settings) { if (options.renderFailure && this.draws.length) throw Error('GPU lost'); this.draws.push({ ...settings }); }
    resize(width, height) { this.resizes.push([width, height]); }
    dispose() { this.disposed = true; }
  }
  const { LiveVideoEffects } = load('src/modules/video-effects/processor.ts', { './types': types, './renderer': { CallRenderer: Renderer } }, {
    performance: { now: () => now }, document: { createElement: () => video, body: { appendChild() {} } },
    MediaStream: class { constructor(tracks) { assert.equal(tracks[0], source); } },
    requestAnimationFrame(callback) { callbacks.set(++id, callback); return id; }, cancelAnimationFrame(value) { callbacks.delete(value); }
  });
  const processor = new LiveVideoEffects(source, value => status.push(value), error => failures.push(error));
  return { processor, source, processed, video, status, failures, callbacks, events, get renderer() { return renderer; },
    frame(time, videoTime = time / 1000) { now = time; video.currentTime = videoTime; const callback = callbacks.values().next().value; callbacks.clear(); if (callback) callback(time); } };
}

test('processor uses existing source, bounds frame rate and applies latest settings without reinitializing', async () => {
  const f = fixture(); f.processor.configure({ whitening: 25, smoothing: 30 });
  const track = await f.processor.start();
  assert.equal(track, f.processed); assert.deepEqual(f.renderer.size, [640, 360]);
  assert.equal(f.renderer.draws.length, 1);
  f.frame(10); assert.equal(f.renderer.draws.length, 1);
  f.frame(34); assert.equal(f.renderer.draws.length, 2);
  f.frame(70, .034); assert.equal(f.renderer.draws.length, 2, 'duplicate source frame is not rendered');
  f.processor.configure({ whitening: 45, smoothing: 50 }); f.frame(100);
  assert.deepEqual(f.renderer.draws.at(-1), { whitening: 45, smoothing: 50 });
  f.video.videoWidth = 720; f.video.videoHeight = 1280; f.frame(140);
  assert.deepEqual(f.renderer.resizes.at(-1), [360, 640], 'orientation change resizes the existing output');
  f.processor.dispose(); f.processor.dispose();
  assert.equal(f.processed.readyState, 'ended'); assert.equal(f.source.readyState, 'live');
  assert.equal(f.callbacks.size, 0); assert.equal(f.video.srcObject, null); assert.equal(f.video.removed, true); assert.equal(f.renderer.disposed, true);
  assert.deepEqual(f.failures, []);
});

test('animation-frame compatibility path also skips repeated camera frames', async () => {
  const f = fixture({ fallback: true }); await f.processor.start();
  f.frame(40); f.frame(80, .04);
  assert.equal(f.renderer.draws.length, 2); assert.equal(f.callbacks.size, 1);
  f.processor.dispose(); assert.equal(f.callbacks.size, 0);
});

test('cancelled startup never resurrects a canvas track or stops the source', async () => {
  const pending = deferred(), f = fixture({ play: pending.promise });
  const started = f.processor.start(); f.processor.dispose(); pending.resolve();
  await assert.rejects(started, /取消/);
  assert.equal(f.renderer, undefined); assert.equal(f.video.srcObject, null); assert.equal(f.source.readyState, 'live');
});

test('cancelling while awaiting the first frame releases listeners and rejects startup', async () => {
  const f = fixture({ waitForFrame: true }); const started = f.processor.start(); await flush();
  assert.equal(f.events.has('loadeddata'), true); f.processor.dispose();
  await assert.rejects(started, /取消/); assert.equal(f.events.size, 0); assert.equal(f.callbacks.size, 0);
});

test('unsupported capture and GPU loss release output and report failure once', async () => {
  const unsupported = fixture({ noCapture: true });
  await assert.rejects(unsupported.processor.start(), /不支持美颜/);
  assert.equal(unsupported.renderer.disposed, true); assert.equal(unsupported.source.readyState, 'live');
  const f = fixture({ renderFailure: true }); await f.processor.start(); f.frame(40);
  assert.equal(f.failures.length, 1); assert.equal(f.processed.readyState, 'ended'); assert.equal(f.callbacks.size, 0); assert.equal(f.source.readyState, 'live');
  f.renderer.failed(Error('another loss')); assert.equal(f.failures.length, 1);
});
