const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { create } = require('zustand');

function load(file, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: name => dependencies[name] || require(name), console, Error, crypto: webcrypto, ...globals }, { filename });
  return exports;
}

test('JSON parsing supports objects, arrays and all valid scalar values without rewriting source', () => {
  const { parseJson } = load('src/app/cloud/plaza/types.ts', { '../navigation': load('src/app/cloud/navigation.ts') });
  for (const text of ['{"x":1}', '[1,null]', '0', 'false', 'null', '"hello"', '""']) {
    const parsed = parseJson(text);
    assert.equal(parsed.valid, true);
    assert.equal(JSON.stringify(parsed.value), JSON.stringify(JSON.parse(text)));
  }
  for (const text of ['', ' ', '{broken}', 'undefined']) assert.equal(parseJson(text).valid, false);
});

test('plaza links use query parameters and accept both short and legacy message IDs', () => {
  const { CLOUD_PATH, PLAZA_PATH, plazaSharePath, isPlazaMessageId } = load('src/app/cloud/navigation.ts');
  assert.equal(CLOUD_PATH, '/cloud');
  assert.equal(PLAZA_PATH, '/cloud?tab=plaza');
  for (const id of ['Ab_cd-12', 'a'.repeat(32)]) {
    const url = new URL(plazaSharePath(id), 'https://neon.example');
    assert.equal(url.pathname, '/cloud');
    assert.equal(url.searchParams.get('tab'), 'plaza');
    assert.equal(url.searchParams.get('id'), id);
    assert.equal(isPlazaMessageId(id), true);
  }
  for (const id of ['', '../bad-id', 'x'.repeat(9), 'A'.repeat(32)]) assert.equal(isPlazaMessageId(id), false);
  assert.equal(new URL(plazaSharePath('a&tab=cloud'), 'https://neon.example').searchParams.get('id'), 'a&tab=cloud');
});

test('folder drops snapshot entries synchronously and continue across directory batches', async () => {
  const { droppedFiles } = load('src/app/cloud/attachments.ts');
  const leaf = (name, text) => ({ name, isFile: true, file(resolve) { setImmediate(() => resolve({ name, type: 'text/plain', size: text.length })); } });
  const batches = [[leaf('one.txt', 'one')], [leaf('two.txt', 'two')], []];
  const directory = { name: 'folder', isDirectory: true, createReader: () => ({ readEntries(resolve) { setImmediate(() => resolve(batches.shift())); } }) };
  const transfer = { items: [{ kind: 'file', webkitGetAsEntry: () => directory }, { kind: 'file', getAsFile: () => ({ name: 'plain.txt', type: 'text/plain', size: 1 }) }], files: [] };
  const pending = droppedFiles(transfer);
  transfer.items.length = 0;
  const result = await pending;
  assert.deepEqual(Array.from(result, item => item.relativePath), ['folder/one.txt', 'folder/two.txt', 'plain.txt']);
  assert.equal(new Set(result.map(item => item.id)).size, 3);
});

function fixture() {
  const requests = [];
  const store = load('src/app/cloud/plaza/store.ts', { zustand: { create }, './client': { loadPlaza: cursor => new Promise((resolve, reject) => requests.push({ cursor, resolve, reject })) } }, { localStorage: { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } } });
  const item = (id, text = id) => ({ messageId: id, content: text, files: [], createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 60000).toISOString() });
  return { store, requests, item, response: (items, nextCursor = null) => ({ items, nextCursor, serverNow: new Date().toISOString() }) };
}

test('manual refresh preserves the draft and previous cards when the request fails', async () => {
  const { store, requests, item } = fixture();
  store.setPlazaText('draft');
  store.usePlazaStore.setState({ files: [{ id: 'draft-file' }], items: [item('old')] });
  const pending = store.refreshPlaza();
  requests[0].reject(Error('offline'));
  await pending;
  const state = store.usePlazaStore.getState();
  assert.equal(state.text, 'draft');
  assert.equal(state.files[0].id, 'draft-file');
  assert.equal(state.items[0].messageId, 'old');
  assert.equal(state.error, 'offline');
  assert.equal(state.busy, null);
});

test('late refresh cannot resurrect a deleted card or overwrite a newly sent card', async () => {
  const { store, requests, item, response } = fixture();
  const pending = store.refreshPlaza();
  store.addPlazaMessage(item('new'), new Date().toISOString());
  store.removePlazaMessage('old');
  requests[0].resolve(response([item('old')]));
  await pending;
  assert.deepEqual(Array.from(store.usePlazaStore.getState().items, item => item.messageId), ['new']);
  assert.equal(store.usePlazaStore.getState().busy, null);
});

test('pagination deduplicates overlap and refresh resets the pagination cursor', async () => {
  const { store, requests, item, response } = fixture();
  let pending = store.refreshPlaza(); requests[0].resolve(response([item('a')], 'older')); await pending;
  pending = store.refreshPlaza(true); assert.equal(requests[1].cursor, 'older'); requests[1].resolve(response([item('a'), item('b')])); await pending;
  assert.deepEqual(Array.from(store.usePlazaStore.getState().items, item => item.messageId), ['a', 'b']);
  pending = store.refreshPlaza(); requests[2].resolve(response([])); await pending;
  assert.equal(store.usePlazaStore.getState().items.length, 0);
  assert.equal(store.usePlazaStore.getState().nextCursor, null);
});

test('unavailable local history storage does not turn a successful send into an error', () => {
  const { store } = fixture();
  assert.doesNotThrow(store.readPlazaHistory);
  assert.doesNotThrow(() => store.savePlazaHistory([{ text: 'sent', timestamp: Date.now() }]));
  assert.equal(store.usePlazaStore.getState().textHistory[0].text, 'sent');
});

test('retry remembers whether the failed request was a refresh or an older-page load', async () => {
  const { store, requests, item, response } = fixture();
  let pending = store.refreshPlaza(); requests[0].resolve(response([item('a')], 'older')); await pending;
  pending = store.refreshPlaza(true); requests[1].reject(Error('offline')); await pending;
  assert.equal(store.usePlazaStore.getState().failedMore, true);
  pending = store.refreshPlaza(); requests[2].reject(Error('offline')); await pending;
  assert.equal(store.usePlazaStore.getState().failedMore, false);
});
