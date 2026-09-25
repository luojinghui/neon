const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => dependencies[name] || require(name));
  return exports;
}
const item = id => ({ id, text: id, media: [], voice: null, location: null, author: { userId: 'person', name: 'person' }, comments: [], commentCount: 0, liked: false, likeCount: 0, createdAt: new Date().toISOString(), isOwner: false, canDelete: true });
const response = (items = [], total = items.length, page = 1) => ({ items, total, page, pageSize: 12, hasMore: page * 12 < total, isAdmin: false });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture(t) {
  const values = new Map();
  const previous = global.localStorage;
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  global.localStorage = storage;
  t.after(() => { global.localStorage = previous; });
  const cache = load('src/app/moments/feedCache.ts');
  const requests = [];
  let owner = 'a';
  const feed = load('src/app/moments/useMomentFeed.ts', {
    '@/app/profile/client': { getOrCreateIdentity: () => ({ uuid: owner }) },
    '@/app/admin/sessionEvents': {}, './feedCache': cache,
    './client': { getMoments: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) }
  });
  return { ...cache, ...feed, requests, storage, owner: value => { owner = value; }, state: cache.useMomentFeedStore.getState };
}

test('moment cache persists empty results, isolates identities and rejects stale or malformed snapshots', t => {
  const f = fixture(t);
  f.restoreMomentFeed('a');
  f.replaceMomentFeed('a', f.state().version, response([item('one')]));
  assert.equal(f.readMomentFeedCache('a').items[0].id, 'one');
  assert.equal(f.readMomentFeedCache('a').items[0].canDelete, false, 'cached administrator privileges are not reused');
  assert.equal(f.readMomentFeedCache('b'), null);
  f.restoreMomentFeed('b');
  f.replaceMomentFeed('b', f.state().version, response());
  assert.deepEqual(f.readMomentFeedCache('b').items, []);
  for (const value of ['broken', JSON.stringify({ owner: 'a', savedAt: Date.now() - f.MOMENT_CACHE_MAX_AGE - 1, data: response() }), JSON.stringify({ owner: 'a', savedAt: Date.now(), data: response([{}]) })]) {
    f.storage.setItem('neon:moment-feed:v1:a', value);
    assert.equal(f.readMomentFeedCache('a'), null);
    assert.equal(f.storage.getItem('neon:moment-feed:v1:a'), null);
  }
  assert.equal(f.readMomentFeedCache('a', { getItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } }), null);
});

test('returning to moments immediately retains all loaded pages and quietly revalidates them', async t => {
  const f = fixture(t);
  f.restoreMomentFeed('a');
  const first = Array.from({ length: 12 }, (_, index) => item(String(index)));
  f.replaceMomentFeed('a', f.state().version, response([...first, item('last')], 13, 2));
  const refresh = f.refreshMomentFeed(false, true);
  assert.equal(f.state().data.items.length, 13);
  assert.equal(f.state().loading, false);
  assert.deepEqual(f.requests.map(request => request.options.page), [1, 2]);
  f.requests[0].resolve(response(first, 14));
  f.requests[1].resolve(response([item('last'), item('new')], 14, 2));
  await refresh;
  assert.equal(f.state().data.items.length, 14);
  assert.equal(f.state().data.page, 2);
  const failed = f.refreshMomentFeed(false, true);
  f.requests[2].reject(Error('offline')); f.requests[3].reject(Error('offline'));
  await failed;
  assert.equal(f.state().data.items.length, 14);
  assert.equal(f.state().error, '');
});

test('late refreshes cannot overwrite mutations or a new identity and requests are deduplicated', async t => {
  const f = fixture(t);
  f.restoreMomentFeed('a');
  f.replaceMomentFeed('a', f.state().version, response([item('one')]));
  const first = f.refreshMomentFeed(false, true);
  const duplicate = f.refreshMomentFeed(false, true);
  assert.equal(f.requests.length, 1);
  f.patchCachedMoment('a', 'one', value => ({ ...value, liked: true, likeCount: 1 }));
  f.requests[0].resolve(response([item('one')]));
  await Promise.all([first, duplicate]);
  assert.equal(f.state().data.items[0].liked, true);
  assert.equal(f.requests.length, 2, 'a conflicting mutation triggers fresh revalidation');
  f.owner('b');
  const next = f.refreshMomentFeed();
  assert.equal(f.state().data, null);
  f.requests[1].resolve(response([item('old-user')]));
  f.requests[2].resolve(response([item('new-user')]));
  await next; await flush();
  assert.deepEqual(f.state().data.items.map(value => value.id), ['new-user']);
  f.patchCachedMoment('a', 'new-user', value => ({ ...value, liked: true }));
  assert.equal(f.state().data.items[0].liked, false);
});

test('pagination deduplicates overlaps and preserves cache when loading more fails', async t => {
  const f = fixture(t);
  f.restoreMomentFeed('a');
  f.replaceMomentFeed('a', f.state().version, response([item('one')], 30));
  const load = f.refreshMomentFeed(true);
  f.requests[0].resolve(response([item('one'), item('two')], 30, 2));
  await load;
  assert.deepEqual(f.state().data.items.map(value => value.id), ['one', 'two']);
  const failed = f.refreshMomentFeed(true);
  f.requests[1].reject(Error('offline'));
  await failed;
  assert.equal(f.state().data.page, 2);
  assert.equal(f.state().data.items.length, 2);
  assert.equal(f.state().loadingMore, false);
  assert.equal(f.state().error, 'offline');
});
