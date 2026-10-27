const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { File } = require('node:buffer');
const mongoose = require('mongoose');
const { CloudPlazaMessage } = require('../src/server/models/cloudPlaza');
const { PlazaRepository, PLAZA_LIFETIME_MS, ID_PATTERN } = require('../src/server/cloud/plazaRepository');

// Explicit opt-in to an isolated local MongoDB; never reads the application's DB URI.
const port = process.env.PLAZA_TEST_MONGO_PORT;
const integration = (name, run) => test(name, { skip: !port }, run);
let connection, model, directory;
let now = Date.parse('2026-10-26T12:00:00Z');
let repository;

before(async () => {
  if (!port) return;
  assert.match(port, /^[0-9]{4,5}$/);
  const database = `neon_plaza_test_${randomBytes(6).toString('hex')}`;
  connection = await mongoose.createConnection(`mongodb://127.0.0.1:${port}/${database}`, { serverSelectionTimeoutMS: 5000 }).asPromise();
  model = connection.model('PlazaTestMessage', CloudPlazaMessage.schema);
  await model.init();
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-plaza-test-'));
  repository = new PlazaRepository({ model, uploadDirectory: directory, now: () => now });
});

after(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('neon-plaza-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('new message IDs use eight URL-safe characters while previous IDs remain valid', async () => {
  const repository = new PlazaRepository({ model: { create: async record => record } });
  const items = await Promise.all(Array.from({ length: 20 }, () => repository.create('short share')));
  for (const item of items) assert.match(item.messageId, /^[A-Za-z0-9_-]{8}$/);
  assert.equal(new Set(items.map(item => item.messageId)).size, items.length);
  assert.equal(ID_PATTERN.test('a'.repeat(32)), true);
  for (const invalid of ['short', '../bad-id', 'a'.repeat(9), 'A'.repeat(32)]) assert.equal(ID_PATTERN.test(invalid), false);
  await assert.rejects(repository.getFile(items[0].messageId), { status: 404 });
});

test('duplicate message IDs retry with a new ID without uploading attachments again', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-plaza-test-'));
  const attempts = [];
  let reads = 0;
  const duplicate = Object.assign(new Error('duplicate message ID'), { code: 11000, keyPattern: { messageId: 1 } });
  const repository = new PlazaRepository({
    uploadDirectory: directory,
    messageIdGenerator: () => attempts.length === 0 ? 'existing' : 'new-id_1',
    model: { create: async record => { attempts.push(record); if (attempts.length === 1) throw duplicate; return record; } }
  });
  try {
    const file = { name: 'once.txt', size: 4, type: 'text/plain', arrayBuffer: async () => { reads++; return Buffer.from('once'); } };
    const item = await repository.create('with attachment', [file]);
    assert.deepEqual(attempts.map(item => item.messageId), ['existing', 'new-id_1']);
    assert.equal(item.messageId, 'new-id_1');
    assert.equal(reads, 1);
    assert.match(item.files[0].fileId, /^[a-f0-9]{32}$/);
    assert.equal((await fs.readdir(directory)).length, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('exhausted ID collisions roll back uploaded files and other database failures do not retry', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-plaza-test-'));
  let attempts = 0;
  const duplicate = Object.assign(new Error('duplicate message ID'), { code: 11000, keyValue: { messageId: 'existing' } });
  const repository = new PlazaRepository({ uploadDirectory: directory, model: { create: async () => { attempts++; throw duplicate; } } });
  try {
    await assert.rejects(repository.create('collision', [new File(['rollback'], 'rollback.txt')]), /duplicate message ID/);
    assert.equal(attempts, 5);
    assert.deepEqual(await fs.readdir(directory), []);
    attempts = 0;
    const failing = new PlazaRepository({ model: { create: async () => { attempts++; throw new Error('database unavailable'); } } });
    await assert.rejects(failing.create('failure'), /database unavailable/);
    assert.equal(attempts, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

integration('one mixed card retains exact text, all attachments and a fixed 48-hour expiry', async () => {
  const text = '原文\r\n{"x": 1}\n';
  const item = await repository.create(text, [new File(['hello'], '说明.txt'), new File(['world'], 'data.json')], ['资料/说明.txt', '资料/data.json']);
  assert.equal(item.content, text);
  assert.equal(item.files.length, 2);
  assert.equal(item.files[0].relativePath, '资料/说明.txt');
  assert.equal(Date.parse(item.expireAt) - Date.parse(item.createdAt), PLAZA_LIFETIME_MS);
  assert.equal('storagePath' in item.files[0], false);
  assert.equal('password' in item, false);
  assert.equal('userId' in item, false);
  const again = await repository.get(item.messageId);
  assert.deepEqual(again, item);
  const file = await repository.getFile(item.files[0].fileId);
  assert.equal(await fs.readFile(file.filePath, 'utf8'), 'hello');
  await repository.remove(item.messageId);
  await assert.rejects(repository.get(item.messageId), { status: 404 });
  await assert.rejects(repository.getFile(item.files[0].fileId), { status: 404 });
  await assert.rejects(fs.stat(file.filePath), { code: 'ENOENT' });
  await assert.doesNotReject(repository.remove(item.messageId));
});

integration('blank text is rejected while files alone form one valid card', async () => {
  await assert.rejects(repository.create(' \n '), { status: 400 });
  const card = await repository.create('', [new File(['x'], 'only.txt')]);
  assert.equal(card.content, '');
  assert.equal(card.files.length, 1);
  await repository.remove(card.messageId);
});

integration('the unique database index rejects a collision and creation recovers with another short ID', async () => {
  const ids = ['clash_01', 'clash_01', 'fresh_02'];
  const colliding = new PlazaRepository({ model, uploadDirectory: directory, now: () => now, messageIdGenerator: () => ids.shift() });
  const previous = await colliding.create('existing');
  const next = await colliding.create('retry');
  assert.equal(previous.messageId, 'clash_01');
  assert.equal(next.messageId, 'fresh_02');
  assert.equal((await repository.get(previous.messageId)).content, 'existing');
  assert.equal((await repository.get(next.messageId)).content, 'retry');
  await Promise.all([repository.remove(previous.messageId), repository.remove(next.messageId)]);
});

integration('pagination remains stable when multiple messages have identical timestamps', async () => {
  const created = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.create(`page ${index}`)));
  const expected = created.map(item => item.messageId).sort().reverse();
  const seen = [];
  let cursor;
  do {
    const page = await repository.list(cursor, 2);
    seen.push(...page.items.map(item => item.messageId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, expected);
  await Promise.all(created.map(item => repository.remove(item.messageId)));
  await assert.rejects(repository.list('bad-cursor'), { status: 400 });
  await assert.rejects(repository.get('../anything'), { status: 400 });
});

integration('legacy message IDs remain readable and deletable alongside short IDs in pagination', async () => {
  const legacyId = 'a'.repeat(32);
  await model.create({ messageId: legacyId, content: 'previous share', files: [], createdAt: new Date(now), expireAt: new Date(now + PLAZA_LIFETIME_MS) });
  const short = await repository.create('new share');
  assert.match(short.messageId, /^[A-Za-z0-9_-]{8}$/);
  assert.equal((await repository.get(legacyId)).content, 'previous share');
  const first = await repository.list(undefined, 1);
  assert.ok(first.nextCursor);
  const second = await repository.list(first.nextCursor, 1);
  assert.deepEqual([...first.items, ...second.items].map(item => item.messageId).sort(), [legacyId, short.messageId].sort());
  await repository.remove(legacyId);
  await assert.rejects(repository.get(legacyId), { status: 404 });
  await repository.remove(short.messageId);
});

integration('expiry blocks list, detail and file access before physical cleanup and reclaims files afterward', async () => {
  const card = await repository.create('expires', [new File(['ephemeral'], 'temporary.txt')]);
  const stored = await repository.getFile(card.files[0].fileId);
  now += PLAZA_LIFETIME_MS;
  assert.equal((await repository.list()).items.length, 0);
  await assert.rejects(repository.get(card.messageId), { status: 404 });
  await assert.rejects(repository.getFile(card.files[0].fileId), { status: 404 });
  assert.ok(await fs.stat(stored.filePath));
  await repository.cleanupExpired();
  assert.equal(await model.countDocuments({ messageId: card.messageId }), 0);
  await assert.rejects(fs.stat(stored.filePath), { code: 'ENOENT' });
});

integration('failed persistence rolls back uploaded files', async () => {
  const beforeFiles = await fs.readdir(directory);
  const failing = new PlazaRepository({ model: { create: async () => { throw new Error('simulated database failure'); } }, uploadDirectory: directory });
  await assert.rejects(failing.create('text', [new File(['rollback'], 'rollback.txt')]), /simulated database failure/);
  assert.deepEqual(await fs.readdir(directory), beforeFiles);
});

integration('failed file cleanup leaves a hidden tombstone and a subsequent cleanup retries it', async () => {
  const card = await repository.create('retry cleanup', [new File(['content'], 'retry.txt')]);
  const stored = await repository.getFile(card.files[0].fileId);
  const originalPurge = repository.purge;
  repository.purge = async () => { const error = new Error('simulated file lock'); error.code = 'EBUSY'; throw error; };
  try { await repository.remove(card.messageId); } finally { repository.purge = originalPurge; }
  assert.ok((await model.findOne({ messageId: card.messageId }).lean()).deletedAt);
  await assert.rejects(repository.get(card.messageId), { status: 404 });
  await assert.rejects(repository.getFile(card.files[0].fileId), { status: 404 });
  await repository.cleanupExpired();
  assert.equal(await model.countDocuments({ messageId: card.messageId }), 0);
  await assert.rejects(fs.stat(stored.filePath), { code: 'ENOENT' });
});
