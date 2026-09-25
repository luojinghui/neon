const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const postcss = require('postcss');
const { parseStyle, normalizeStyle } = require('@ant-design/cssinjs/lib/hooks/useStyleRegister');
const { Keyframes } = require('@ant-design/cssinjs');
const { hoverOnlyTransformer } = require('../src/styles/hover-policy');

function load(relative, dependencies = {}) {
  const file = path.resolve(__dirname, '..', relative);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => dependencies[name] || require(name));
  return exports;
}
const cache = load('src/app/soul/core/roomListCache.ts');
const { useSoulStore: store } = load('src/app/soul/store.ts');
const { fitPortraitFrame } = load('src/app/doodle/portrait/framing.ts');
const { buildSticker } = load('src/app/doodle/portrait/meshes.ts');
const settings = load('src/app/doodle/portrait/settings.ts');
const { LivePreview } = load('src/app/doodle/portrait/livePreview.ts');
const faceMesh = load('src/app/doodle/portrait/faceMesh.ts', { './meshes': load('src/app/doodle/portrait/meshes.ts') });
const room = id => ({ id, name: id, description: 'test', tags: [], isPrivate: false, owner: { userId: 'test' }, membership: 'none' });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: index => [...values.keys()][index], get length() { return values.size; } };
}

test('vision downloads share in-flight bytes, report progress, reuse cache and retry failed resources', async () => {
  const filename = path.resolve(__dirname, '../src/app/doodle/visionRuntime.ts');
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {}, requests = [], cached = new Map(); let fail = false;
  vm.runInNewContext(outputText, { exports, navigator: {}, Uint8Array,
    caches: { open: async () => ({ match: async url => cached.has(url) ? new Response(cached.get(url)) : undefined, put: async (url, response) => { cached.set(url, await response.arrayBuffer()); } }) },
    fetch: async url => {
      requests.push(url);
      if (fail) return new Response('<html>not a model</html>', { headers: { 'content-type': 'text/html' } });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.close(); } }), { headers: { 'content-length': '4' } });
    }
  }, { filename });
  const first = [], second = [];
  const [a, b] = await Promise.all([exports.visionAsset('face_landmarker.task', n => first.push(n)), exports.visionModel('face_landmarker.task'), exports.visionAsset('face_landmarker.task', n => second.push(n))]);
  assert.deepEqual([...a], [1, 2, 3, 4]); assert.equal(a, b); assert.equal(requests.length, 1);
  assert.ok(first.includes(2) && second.includes(2)); assert.equal(first.at(-1), 4); assert.equal(second.at(-1), 4);
  assert.equal(cached.size, 1); await exports.visionAsset('face_landmarker.task'); assert.equal(requests.length, 1);
  fail = true; await assert.rejects(exports.visionModel('selfie_multiclass.tflite'), /暂时无法加载/);
  fail = false; assert.deepEqual([...await exports.visionModel('selfie_multiclass.tflite')], [1, 2, 3, 4]);
  await assert.rejects(exports.visionAsset('../secret'), /未知/); assert.equal(requests.length, 3);
});

test('planet cache isolates identities, retains an empty result and rejects stale/corrupt data', () => {
  const s = storage();
  cache.writeRoomListCache('a', [room('first')], s);
  assert.equal(cache.readRoomListCache('a', s)[0].id, 'first');
  assert.equal(cache.readRoomListCache('b', s), null);
  cache.writeRoomListCache('b', [], s);
  assert.deepEqual(cache.readRoomListCache('b', s), []);
  for (const value of ['broken', JSON.stringify({ owner: 'a', rooms: [], savedAt: Date.now() - cache.ROOM_LIST_MAX_AGE - 1 }), JSON.stringify({ owner: 'b', rooms: [], savedAt: Date.now() }), JSON.stringify({ owner: 'a', rooms: [{}], savedAt: Date.now() })]) {
    s.setItem('neon:planet-list:v1:a', value);
    assert.equal(cache.readRoomListCache('a', s), null);
    assert.equal(s.getItem('neon:planet-list:v1:a'), null);
  }
  const disabled = { getItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.equal(cache.readRoomListCache('a', disabled), null);
  assert.doesNotThrow(() => cache.writeRoomListCache('a', [], disabled));
});

test('planet list restores before network, survives errors and ignores late sessions/responses', async () => {
  const previousStorage = global.localStorage;
  global.localStorage = storage();
  const pending = [];
  class Transport {
    async connect() {}
    listRooms() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); }
    onConnectionChange() { return () => {}; }
    onRoomsChanged() { return () => {}; }
    async leaveRoom() {}
    disconnect() {}
  }
  let owner = 'cached-user';
  const { SoulChat } = load('src/app/soul/core/index.ts', {
    '../store': { useSoulStore: store },
    '../../profile/client': { getOrCreateIdentity: () => ({ uuid: owner }), ensureCurrentProfile: async () => ({ uuid: owner }) },
    './roomListCache': cache,
    './socketTransport': { SocketChatTransport: Transport, SocketChatError: Error }
  });
  const core = new SoulChat();
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    store.setState({ rooms: [], roomsState: 'idle' });
    cache.writeRoomListCache(owner, [room('cached')]);
    const init = core.initList();
    assert.equal(store.getState().roomsState, 'ready');
    assert.equal(store.getState().rooms[0].id, 'cached');
    await tick();
    pending.shift().resolve([room('fresh')]); await init;
    const refresh = core.loadRooms();
    assert.equal(store.getState().roomsState, 'ready');
    pending.shift().reject(Error('offline')); await refresh;
    assert.equal(store.getState().rooms[0].id, 'fresh');
    assert.equal(store.getState().roomsState, 'ready');
    const first = core.loadRooms(true), second = core.loadRooms(true);
    const older = pending.shift(), newer = pending.shift();
    newer.resolve([room('newest')]); await second;
    older.resolve([room('old')]); await first;
    assert.equal(store.getState().rooms[0].id, 'newest');
    const late = core.loadRooms(true); core.destroy();
    pending.shift().resolve([room('after-unmount')]); await late;
    assert.equal(store.getState().rooms[0].id, 'newest');
    owner = 'another-user';
    const switched = core.initList();
    assert.deepEqual(store.getState().rooms, []);
    await tick(); pending.shift().resolve([]); await switched;
    assert.equal(store.getState().roomsState, 'ready');
  } finally { core.destroy(); global.localStorage = previousStorage; }
});

function assertHoverGuard(css) {
  let count = 0;
  postcss.parse(css).walkRules(rule => {
    if (!/(?<!\\):hover\b/.test(rule.selector)) return;
    count++;
    let guarded = false;
    for (let node = rule.parent; node; node = node.parent) if (node.type === 'atrule' && node.name === 'media' && node.params.includes('hover: hover') && node.params.includes('pointer: fine')) guarded = true;
    assert.ok(guarded, rule.selector);
  });
  assert.ok(count > 0);
}

test('build CSS guards plain, grouped and Tailwind hover without removing focus or active styles', async () => {
  const source = '.button:hover,.button:focus-visible {color:red} .group:hover .group-hover\\:opacity-100{opacity:1} @media(min-width:700px){.x:hover{color:blue}} .button:active{color:green}';
  const result = await postcss([require('./postcss-hover.cjs')()]).process(source, { from: undefined });
  assertHoverGuard(result.css);
  const root = postcss.parse(result.css);
  assert.equal(root.nodes.find(n => n.selector === '.button:focus-visible').parent.type, 'root');
  assert.equal(root.nodes.find(n => n.selector === '.button:active').parent.type, 'root');
});

test('Ant Design runtime transformer preserves animations and focus without recursive wrapping', () => {
  const animation = new Keyframes('test-spin', { to: { transform: 'rotate(360deg)' } });
  const style = { '.button': { color: 'black', animationName: animation, '&:hover, &:focus-visible': { color: 'red' }, '&:active': { color: 'green' }, '.icon:hover': { opacity: .5 } } };
  const transformed = hoverOnlyTransformer.visit(style);
  assert.equal(hoverOnlyTransformer.visit(transformed), transformed);
  assert.equal(transformed['.button'].animationName, animation);
  const [raw, effects] = parseStyle(style, { transformers: [hoverOnlyTransformer] });
  const css = normalizeStyle(raw, true);
  assertHoverGuard(css);
  assert.match(css, /\.button:focus-visible\{color:red/);
  assert.ok(Object.keys(effects).some(key => key.includes('test-spin')));
});

test('3D accessories and portrait framing keep tilted, oversized geometry within the image', () => {
  for (const sticker of settings.STICKERS.filter(s => s.id !== 'none')) {
    const geometry = buildSticker(sticker.id, '#ffadcb');
    assert.ok(geometry.length > 100 && geometry.length < 300000);
    assert.equal(geometry.length % 27, 0);
    assert.ok(geometry.every(Number.isFinite));
    const points = [];
    for (let i = 0; i < geometry.length; i += 9) points.push([geometry[i] * 1.5 + .8, geometry[i + 1] * 1.5 + 1]);
    const frame = fitPortraitFrame(points);
    for (const p of [...points, [-1, -1], [1, 1]]) {
      assert.ok(Math.abs(p[0] * frame.zoom + frame.offset[0]) <= .941);
      assert.ok(Math.abs(p[1] * frame.zoom + frame.offset[1]) <= .941);
    }
  }
});

test('saved portrait controls reject invalid shader inputs and limit exported copy', () => {
  const normalized = settings.normalizePortrait({ whitening: NaN, smoothing: 200, outline: -20, stickerColor: 'red', stickerScale: Infinity, sticker: 'missing', signature: 'x'.repeat(100), caption: '长'.repeat(100) });
  assert.equal(normalized.whitening, 25);
  assert.equal(normalized.smoothing, 100);
  assert.equal(normalized.outline, 0);
  assert.equal(normalized.sticker, 'cat');
  assert.equal(normalized.stickerColor, '#ffadcb');
  assert.equal(normalized.stickerScale, 1);
  assert.equal(normalized.signature.length, 12);
  assert.equal(normalized.caption.length, 36);
  assert.equal(normalized.faceEffect, 'none');
  assert.equal(normalized.faceEffectStrength, 90);
  assert.equal(settings.normalizePortrait({ faceEffect: 'panda', faceEffectStrength: 999 }).faceEffectStrength, 100);
});

test('every template draws the source portrait once even without canvas filter support', () => {
  const previous = global.document;
  const original = { portrait: true };
  let copies = 0;
  const context = () => new Proxy({}, { get: (target, key) => {
    if (key === 'drawImage') return source => { if (source === original) copies++; };
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return text => ({ width: text.length * 25 });
    return key in target ? target[key] : () => {};
  }, set: (target, key, value) => { if (key !== 'filter') target[key] = value; return true; } });
  global.document = { createElement: () => ({ getContext: context }) };
  try {
    const poster = load('src/app/doodle/poster.ts');
    for (const template of poster.DOODLE_TEMPLATES) for (const [width, height] of [[720,960],[1280,720]]) {
      copies = 0;
      poster.renderDoodlePoster(original, width, height, { title: '测试', templateId: template.id, themeId: 'sun-pop', portrait: settings.DEFAULT_PORTRAIT });
      assert.equal(copies, 1, template.id);
    }
  } finally { global.document = previous; }
});

test('live controls coalesce frames, discard stale encodes, and flush the latest value for saving', async () => {
  const oldFrame = global.requestAnimationFrame, oldCancel = global.cancelAnimationFrame;
  let id = 0;
  const frames = new Map(), drawn = [], published = [], encodes = [];
  global.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  global.cancelAnimationFrame = key => frames.delete(key);
  const scheduler = new LivePreview(canvas => new Promise(resolve => encodes.push({ canvas, resolve })), error => { throw error; }, 10000);
  const request = value => scheduler.request(() => { drawn.push(value); return { value }; }, blob => published.push(blob));
  const drawFrame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  try {
    request('first'); request('second'); drawFrame();
    assert.deepEqual(drawn, ['second']);
    const old = scheduler.flush();
    request('latest');
    const saved = scheduler.flush(); // No animation frame yet: save must still draw the newest state.
    assert.deepEqual(drawn, ['second', 'latest']);
    encodes[1].resolve('latest jpeg');
    assert.equal(await saved, 'latest jpeg');
    encodes[0].resolve('stale jpeg'); await old;
    assert.deepEqual(published, ['latest jpeg']);
    request('unmounted'); scheduler.cancel(); drawFrame();
    assert.deepEqual(drawn, ['second', 'latest']);
  } finally { scheduler.cancel(); global.requestAnimationFrame = oldFrame; global.cancelAnimationFrame = oldCancel; }
});

test('face effects fit actual MediaPipe surface triangles with finite normals and expression openings', async () => {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const topology = faceMesh.faceTriangles(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
  assert.ok(topology.length > 800);
  assert.ok(topology.every(triangle => triangle.every(i => i >= 0 && i < 468)));
  const face = Array.from({ length: 478 }, (_, i) => ({ x: .5 + Math.sin(i * 1.7) * .2, y: .5 + Math.cos(i * 2.3) * .25, z: Math.sin(i * .8) * .08 }));
  for (const [i, x, y] of [[1,.5,.52],[10,.5,.25],[152,.5,.77],[234,.29,.5],[454,.71,.5],[33,.39,.43],[133,.45,.43],[159,.42,.418],[145,.42,.442],[362,.55,.43],[263,.61,.43],[386,.58,.418],[374,.58,.442],[61,.45,.62],[291,.55,.62],[0,.5,.605],[17,.5,.635]]) face[i] = { x, y, z: 0 };
  const data = faceMesh.buildFaceMesh(face, topology, .75);
  assert.equal(data.vertices.length, topology.length * 3 * 8);
  assert.ok(data.vertices.every(Number.isFinite));
  assert.equal(data.features.length, 12);
  assert.ok(data.features.every(Number.isFinite));
  for (let i = 0; i < 12; i += 4) assert.ok(data.features[i + 2] > 0 && data.features[i + 3] > 0);
});

test('local model/WASM manifest matches every committed binary', () => {
  const root = path.join(__dirname, '../public/mediapipe/0.10.35');
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(require('../package.json').dependencies['@mediapipe/tasks-vision'], manifest.version);
  for (const [name, meta] of Object.entries(manifest.files)) {
    const bytes = readFileSync(path.join(root, name));
    assert.equal(bytes.length, meta.bytes, name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256, name);
  }
});

test('vision Service Worker ignores documents, API calls, photos and foreign origins', async () => {
  const events = {}, cached = new Map(); let network = 0;
  const cache = { match: async key => cached.get(key.url), put: async (key, response) => cached.set(key.url, response) };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../public/vision-sw.js'), 'utf8'), {
    self: { location: { origin: 'https://neon.test' }, addEventListener: (name, cb) => { events[name] = cb; } },
    URL, caches: { open: async () => cache }, fetch: async () => { network++; return { ok: true, headers: { get: () => 'application/wasm' }, clone() { return this; } }; }
  });
  const dispatch = (url, method = 'GET') => { let result; events.fetch({ request: { url, method }, respondWith: value => { result = value; } }); return result; };
  for (const url of ['https://neon.test/api/user', 'https://neon.test/uploads/photo.jpg', 'https://neon.test/doodle', 'https://other.test/mediapipe/0.10.35/model.task']) assert.equal(dispatch(url), undefined);
  const url = 'https://neon.test/mediapipe/0.10.35/wasm/vision_wasm_internal.wasm';
  assert.equal(dispatch(url, 'POST'), undefined);
  await dispatch(url); await dispatch(url);
  assert.equal(network, 1);
});
