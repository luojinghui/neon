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
const room = id => ({ id, name: id, description: 'test', tags: [], isPrivate: false, owner: { userId: 'test' }, membership: 'none' });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: index => [...values.keys()][index], get length() { return values.size; } };
}

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
