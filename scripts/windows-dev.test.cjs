'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  STORAGE_KEYS, applyEnvironment, assertLocalMongoUri, configure, ensureAdmin,
  ensureIndexes, ensureSample, loadConfiguration, locations, parseArguments,
  parseManagedEnvironment, publicInfo, validatePort
} = require('./windows-dev.cjs');

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-windows-dev-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  return rootDir;
}

test('configuration is repeatable, leaves other configuration/data intact, and never returns the password', (t) => {
  const rootDir = fixture(t);
  fs.writeFileSync(path.join(rootDir, '.env.local'), 'MONGODB_URI=production-placeholder\n');
  const first = configure({ rootDir });
  const credentialsBefore = fs.readFileSync(first.credentialsFile, 'utf8');
  const envBefore = fs.readFileSync(first.envFile, 'utf8');
  const credentials = JSON.parse(credentialsBefore);
  assert.equal(credentials.username, 'localadmin');
  assert.equal(credentials.password.length, 32);
  const second = configure({ rootDir });
  assert.deepEqual(first, second);
  assert.equal(fs.readFileSync(first.credentialsFile, 'utf8'), credentialsBefore);
  assert.equal(fs.readFileSync(first.envFile, 'utf8'), envBefore);
  assert.equal(fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8'), 'MONGODB_URI=production-placeholder\n');
  assert.equal(JSON.stringify(first).includes(credentials.password), false);
  assert.equal(first.database, 'neon_windows_dev');
  assert.equal(first.adminUrl, 'http://127.0.0.1:3000/admin');
});

test('an unmanaged environment file is never overwritten', (t) => {
  const rootDir = fixture(t);
  const files = locations(rootDir);
  const original = 'MONGODB_URI=mongodb://127.0.0.1:27018/my_database\n';
  fs.writeFileSync(files.envFile, original);
  assert.throws(() => configure({ rootDir }), /not generated/);
  assert.equal(fs.readFileSync(files.envFile, 'utf8'), original);
  assert.equal(fs.existsSync(files.credentialsFile), false);
});

test('port changes and malformed ports fail without resetting the saved password', (t) => {
  const rootDir = fixture(t);
  const result = configure({ rootDir, mongoPort: 27020, appPort: 3010 });
  const original = fs.readFileSync(result.credentialsFile, 'utf8');
  assert.throws(() => configure({ rootDir }), /port differs/);
  assert.throws(() => configure({ rootDir, mongoPort: 27020, appPort: 3000 }), /port differs/);
  for (const value of ['', 0, -1, 65536, 3.5, '3000tail', ' 3000', '03000', Infinity]) {
    assert.throws(() => validatePort(value, 'port'), /integer/);
  }
  assert.throws(() => configure({ rootDir: path.join(rootDir, 'new'), mongoPort: 3000, appPort: 3000 }), /different ports/);
  assert.equal(fs.readFileSync(result.credentialsFile, 'utf8'), original);
});

test('managed environment overrides shell configuration, including production storage paths', (t) => {
  const rootDir = fixture(t);
  configure({ rootDir });
  const config = loadConfiguration({ rootDir });
  const shell = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://example.invalid/production',
    APP_HOST: '0.0.0.0',
    APP_PORT: '443',
    ALLOWED_ORIGINS: 'https://example.invalid',
    NEON_RELEASE_ID: 'production',
    PATH: 'must-remain',
    ...Object.fromEntries(STORAGE_KEYS.map((key) => [key, '/existing-production-data']))
  };
  applyEnvironment(config, shell);
  for (const [key, value] of Object.entries(config.env)) assert.equal(shell[key], value);
  assert.equal(shell.PATH, 'must-remain');
  assert.equal(shell.MONGODB_URI, 'mongodb://127.0.0.1:27018/neon_windows_dev');
  for (const key of STORAGE_KEYS) assert.equal(shell[key], '');
});

test('only the exact generated local MongoDB URI is accepted', () => {
  assert.equal(assertLocalMongoUri('mongodb://127.0.0.1:27018/neon_windows_dev', 27018), 'mongodb://127.0.0.1:27018/neon_windows_dev');
  for (const uri of [
    'mongodb://localhost:27018/neon_windows_dev',
    'mongodb://127.0.0.1:27017/neon_windows_dev',
    'mongodb://127.0.0.1:27018/production',
    'mongodb://127.0.0.1:27018/neon_windows_dev?authSource=admin',
    'mongodb://user:password@127.0.0.1:27018/neon_windows_dev',
    'mongodb+srv://example.invalid/neon_windows_dev',
    'mongodb://127.0.0.1:27018,example.invalid/neon_windows_dev'
  ]) assert.throws(() => assertLocalMongoUri(uri, 27018), /Only the managed local/);
});

test('a modified environment, wrong project path, and duplicate keys are rejected', (t) => {
  const rootDir = fixture(t);
  const result = configure({ rootDir });
  const original = fs.readFileSync(result.envFile, 'utf8');
  for (const modified of [
    original.replace('NODE_ENV=development', 'NODE_ENV=production'),
    original.replace('APP_HOST=127.0.0.1', 'APP_HOST=0.0.0.0'),
    original.replace('SOUL_CHAT_DATA_FILE=', 'SOUL_CHAT_DATA_FILE=/production.json'),
    `${original}UNKNOWN=value\n`
  ]) {
    fs.writeFileSync(result.envFile, modified);
    assert.throws(() => loadConfiguration({ rootDir }), /modified/);
  }
  assert.throws(() => parseManagedEnvironment(`${original}NODE_ENV=development\n`), /duplicate/);
  const otherRoot = fixture(t);
  fs.copyFileSync(result.envFile, locations(otherRoot).envFile);
  assert.throws(() => loadConfiguration({ rootDir: otherRoot }), /modified/);
});

test('missing credentials are not silently regenerated over an existing configured database', (t) => {
  const rootDir = fixture(t);
  const result = configure({ rootDir });
  fs.unlinkSync(result.credentialsFile);
  assert.throws(() => configure({ rootDir }), /credentials are missing/);
  assert.equal(fs.existsSync(result.credentialsFile), false);
});

test('an interrupted setup with saved credentials reuses the original password', (t) => {
  const rootDir = fixture(t);
  const result = configure({ rootDir });
  const saved = fs.readFileSync(result.credentialsFile, 'utf8');
  fs.unlinkSync(result.envFile);
  configure({ rootDir });
  assert.equal(fs.readFileSync(result.credentialsFile, 'utf8'), saved);
  assert.deepEqual(publicInfo(loadConfiguration({ rootDir })), result);
});

test('command-line arguments reject unknown commands, typoed options, and duplicate flags', () => {
  assert.deepEqual(parseArguments(['configure', '--mongo-port=27019', '--app-port=3001']), {
    command: 'configure', options: { mongoPort: 27019, appPort: 3001 }
  });
  assert.throws(() => parseArguments(['remove']), /Usage/);
  assert.throws(() => parseArguments(['configure', '--uri=production']), /Unsupported/);
  assert.throws(() => parseArguments(['configure', '--app-port=3000', '--app-port=3001']), /Duplicate/);
});

function adminModel(existing) {
  const created = [];
  return {
    created,
    findOne(query) {
      assert.deepEqual(query, { username: 'localadmin' });
      return { select(selection) {
        assert.equal(selection, '+passwordHash');
        return { lean: async () => existing };
      } };
    },
    async create(data) { created.push(data); }
  };
}

test('first admin creation hashes the saved password; repeated seeding never resets sessions', async () => {
  const credentials = { username: 'localadmin', password: 'saved-local-password' };
  const fresh = adminModel(null);
  const dependencies = {
    credentials,
    hashPassword: async (password) => { assert.equal(password, credentials.password); return 'hash'; },
    verifyPassword: async (password, hash) => password === credentials.password && hash === 'hash'
  };
  assert.equal(await ensureAdmin({ ...dependencies, AdminUser: fresh }), 'created');
  assert.equal(fresh.created.length, 1);
  assert.equal(fresh.created[0].passwordHash, 'hash');
  const existing = { ...fresh.created[0], sessionIdHash: 'keep-this-session', sessionExpiresAt: 'keep-this-expiry' };
  const repeated = adminModel(existing);
  assert.equal(await ensureAdmin({ ...dependencies, AdminUser: repeated }), 'verified');
  assert.equal(repeated.created.length, 0);
  assert.equal(existing.sessionIdHash, 'keep-this-session');
  assert.equal(existing.sessionExpiresAt, 'keep-this-expiry');
});

test('an existing administrator with a mismatched password or disabled account is not modified', async () => {
  for (const existing of [
    { role: 'super_admin', enabled: true, passwordHash: 'different' },
    { role: 'super_admin', enabled: false, passwordHash: 'matching' },
    { role: 'other', enabled: true, passwordHash: 'matching' }
  ]) {
    const model = adminModel(existing);
    await assert.rejects(ensureAdmin({
      AdminUser: model,
      credentials: { username: 'localadmin', password: 'saved-password' },
      verifyPassword: async (_password, hash) => hash === 'matching',
      hashPassword: async () => { throw new Error('must not reset password'); }
    }), /No password or session was changed/);
    assert.equal(model.created.length, 0);
  }
});

test('sample creation uses seven-day expiry and preserves existing records and code collisions', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const created = [];
  const model = (existing) => ({
    findOne(query) {
      assert.deepEqual(query, { $or: [{ messageId: 'local-project-welcome' }, { password: 'wd' }] });
      return { lean: async () => existing };
    },
    async create(data) { created.push(data); }
  });
  assert.equal(await ensureSample({ CloudMessage: model(null), releaseId: 'local-project', now }), 'created');
  assert.equal(created[0].expireAt.getTime() - created[0].createdAt.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(await ensureSample({ CloudMessage: model(created[0]), releaseId: 'local-project', now }), 'present');
  assert.equal(await ensureSample({ CloudMessage: model({ messageId: 'user-record' }), releaseId: 'local-project', now }), 'skipped-code-in-use');
  assert.equal(created.length, 1);
});

test('index validation checks uniqueness and TTL without removing any indexes', async () => {
  let calls = 0;
  const model = (actual) => ({
    async createCollection() { calls += 1; },
    async createIndexes() { calls += 1; },
    schema: { indexes: () => [[{ username: 1 }, { unique: true }], [{ expireAt: 1 }, { expireAfterSeconds: 0 }]] },
    collection: { name: 'example', indexes: async () => actual }
  });
  const correct = [{ key: { username: 1 }, unique: true }, { key: { expireAt: 1 }, expireAfterSeconds: 0 }];
  await ensureIndexes([model(correct)]);
  assert.equal(calls, 2);
  await assert.rejects(ensureIndexes([model([{ key: { username: 1 } }, correct[1]])]), /missing or incompatible/);
  await assert.rejects(ensureIndexes([model([correct[0], { key: { expireAt: 1 }, expireAfterSeconds: 60 }])]), /missing or incompatible/);
});
