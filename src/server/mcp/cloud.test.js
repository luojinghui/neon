const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createCloudService } = require('./cloud');
const { MAX_FILE_BYTES } = require('./attachments');

function memoryCloudModel() {
  const records = [];
  return {
    records,
    async findOne(query) {
      return records.find(item => query.password.test(item.password) && (!query.expireAt || item.expireAt > query.expireAt.$gt)) || null;
    },
    async create(item) { records.push(item); return item; }
  };
}

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-mcp-cloud-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('neon-mcp-cloud-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const model = memoryCloudModel();
  const service = createCloudService({
    connectDB: async () => {}, cloudModel: model, plazaRepository: {},
    uploadDirectory: directory, publicBaseUrl: 'https://neon.example',
    now: () => Date.parse('2026-10-28T10:00:00Z'), ...options
  });
  return { directory, model, ...service };
}

test('云传保留图文与多附件，生成可查看密码和安全文件链接', async t => {
  const f = await fixture(t, { createPassword: () => 'ab12' });
  const text = '原文\r\n{"a": 1}\n';
  const result = await f.publishCloud({ text, files: [
    { name: '图片.png', mimeType: 'image/png', buffer: Buffer.from('image') },
    { name: '../../资料.txt', buffer: Buffer.from('attachment'), relativePath: '文档/资料.txt' }
  ] });
  assert.equal(result.password, 'ab12');
  assert.equal(result.text, text);
  assert.equal(result.expiresAt, '2026-11-04T10:00:00.000Z');
  assert.equal(result.viewUrl, 'https://neon.example/cloud?pwd=ab12');
  assert.equal(result.files.length, 2);
  assert.match(result.files[0].url, /^https:\/\/neon\.example\/api\/cloud\/file\/[a-f0-9]{24}$/);
  assert.equal(result.files[1].relativePath, '文档/资料.txt');
  assert.equal(result.files[1].mimeType, 'application/octet-stream');
  assert.equal(result.files[1].size, 10);
  assert.equal(f.model.records[0].messageType, 'mixed');
  for (const record of f.model.records[0].files) {
    assert.match(record.storagePath, /^[a-f0-9]{24}\.(png|txt)$/);
    assert.equal(path.dirname(path.join(f.directory, record.storagePath)), f.directory);
  }
  assert.deepEqual(await fs.readFile(path.join(f.directory, f.model.records[0].files[1].storagePath)), Buffer.from('attachment'));
  assert.deepEqual(await f.readCloud({ password: ' AB12 ' }), result);
  assert.equal(JSON.stringify(result).includes('storagePath'), false);
  assert.equal(JSON.stringify(result).includes('userId'), false);
});

test('云传明确阻止过期内容和非法查询码', async t => {
  let now = Date.parse('2026-10-28T10:00:00Z');
  const f = await fixture(t, { now: () => now });
  const result = await f.publishCloud({ text: '内容' });
  now += 7 * 24 * 60 * 60 * 1000;
  await assert.rejects(f.readCloud({ password: result.password }), { status: 404 });
  for (const password of ['.*', 'a', 'abcde', { $ne: null }, '', null]) {
    await assert.rejects(f.readCloud({ password }), { status: 400 });
  }
});

test('数据库保存失败时删除本次写入的全部附件', async t => {
  const f = await fixture(t, {
    cloudModel: { findOne: async () => null, create: async () => { throw new Error('数据库故障'); } }
  });
  await assert.rejects(f.publishCloud({ files: [{ name: 'data.txt', buffer: Buffer.from('rollback') }] }), /数据库故障/);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('保存后的解锁失败继续传播，已经持久化的附件仍然保留', async t => {
  const model = memoryCloudModel();
  const f = await fixture(t, { cloudModel: model });
  const lockFile = path.join(f.directory, '.mcp-cloud-password.lock');
  const originalUnlink = fs.unlink;
  const create = model.create;
  model.create = async data => {
    const result = await create(data);
    fs.unlink = async filePath => {
      if (filePath === lockFile) throw Object.assign(new Error('模拟解锁失败'), { code: 'EACCES' });
      return originalUnlink(filePath);
    };
    return result;
  };
  try {
    await assert.rejects(f.publishCloud({ files: [{ name: 'saved.txt', buffer: Buffer.from('saved') }] }), { code: 'EACCES' });
  } finally {
    fs.unlink = originalUnlink;
    await fs.unlink(lockFile);
  }
  assert.equal(model.records.length, 1);
  assert.equal(await fs.readFile(path.join(f.directory, model.records[0].files[0].storagePath), 'utf8'), 'saved');
});

test('密码碰撞会重试，并在并发 MCP 发布之间保持分配顺序', async t => {
  const values = ['aaaa', 'aaaa', 'bbbb'];
  const f = await fixture(t, { createPassword: () => values.shift() });
  const results = await Promise.all([f.publishCloud({ text: '一' }), f.publishCloud({ text: '二' })]);
  assert.deepEqual(results.map(item => item.password), ['aaaa', 'bbbb']);
  assert.equal(f.model.records.length, 2);
});

test('两个 Node 进程共享上传目录时，相同首选密码不会生成重复记录', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const worker = `
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const { createCloudService } = require(process.argv[1]);
    const directory = process.argv[2];
    const fallback = process.argv[3];
    const dataFile = path.join(directory, 'shared-records.jsonl');
    async function readRecords() {
      try { return (await fs.readFile(dataFile, 'utf8')).trim().split('\\n').filter(Boolean).map(line => JSON.parse(line)); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    const model = {
      async findOne(query) {
        const records = await readRecords();
        // 模拟查询与写入之间的数据库延迟，放大没有进程锁时的碰撞窗口。
        await new Promise(resolve => setTimeout(resolve, 150));
        return records.find(item => query.password.test(item.password)) || null;
      },
      async create(data) {
        await fs.appendFile(dataFile, JSON.stringify(data) + '\\n');
        return data;
      }
    };
    let attempt = 0;
    const service = createCloudService({
      connectDB: async () => {}, cloudModel: model, plazaRepository: {},
      uploadDirectory: directory, createPassword: () => attempt++ ? fallback : 'aaaa'
    });
    process.once('message', async () => {
      try {
        const result = await service.publishCloud({ text: fallback });
        process.send({ result });
      } catch (error) {
        process.send({ error: error.message });
        process.exitCode = 1;
      } finally { process.disconnect(); }
    });
    process.send({ ready: true });
  `;
  const children = ['bbbb', 'cccc'].map(fallback => {
    const child = spawn(process.execPath, ['-e', worker, require.resolve('./cloud'), f.directory, fallback], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let result, errorText = '';
    child.stderr.on('data', chunk => { errorText += chunk; });
    const ready = new Promise((resolve, reject) => {
      child.on('message', message => { if (message.ready) resolve(); });
      child.once('error', reject);
      child.once('exit', code => { if (code !== 0) reject(new Error(errorText || `子进程退出：${code}`)); });
    });
    const done = new Promise((resolve, reject) => {
      child.on('message', message => { if (message.result) result = message.result; if (message.error) errorText += message.error; });
      child.once('error', reject);
      child.once('exit', code => code === 0 && result ? resolve(result) : reject(new Error(errorText || `子进程退出：${code}`)));
    });
    return { child, ready, done };
  });
  try {
    await Promise.all(children.map(item => item.ready));
    children.forEach(item => item.child.send({ start: true }));
    const results = await Promise.all(children.map(item => item.done));
    assert.equal(new Set(results.map(item => item.password)).size, 2);
    assert.ok(results.some(item => item.password === 'aaaa'));
    const records = (await fs.readFile(path.join(f.directory, 'shared-records.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.equal(new Set(records.map(item => item.password)).size, 2);
    await assert.rejects(fs.stat(path.join(f.directory, '.mcp-cloud-password.lock')), { code: 'ENOENT' });
  } finally {
    await Promise.all(children.map(({ child }) => {
      if (child.exitCode !== null) return;
      return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }));
  }
});

test('密码空间繁忙时有限重试并回滚文件', async t => {
  const model = memoryCloudModel();
  model.records.push({ password: 'aaaa' });
  const f = await fixture(t, { cloudModel: model, createPassword: () => 'aaaa' });
  await assert.rejects(f.publishCloud({ files: [{ name: 'retry.txt', buffer: Buffer.from('x') }] }), { status: 503 });
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('广场沿用仓库上传和有效期，并仅返回公开字段', async t => {
  const id = 'a'.repeat(32);
  let called = false;
  const f = await fixture(t, { plazaRepository: {
    async create(text, files, relativePaths) {
      called = true;
      assert.equal(text, '公开图文');
      assert.equal(files[0].name, '图片.png');
      assert.deepEqual(await files[0].arrayBuffer(), Buffer.from('png'));
      assert.deepEqual(relativePaths, ['图片.png']);
      return {
        messageId: id, content: text, expireAt: '2026-10-30T10:00:00Z',
        authorId: 'private', deleteToken: 'private',
        files: [{ fileId: id, fileName: files[0].name, fileSize: files[0].size, mimeType: files[0].type, storagePath: 'private' }]
      };
    }
  } });
  const result = await f.publishPlaza({ text: '公开图文', files: [{ name: '图片.png', mimeType: 'image/png', buffer: Buffer.from('png') }] });
  assert.equal(called, true);
  assert.equal(result.expiresAt, '2026-10-30T10:00:00.000Z');
  assert.equal(result.viewUrl, `https://neon.example/cloud/plaza/${id}`);
  assert.equal(result.files[0].url, `https://neon.example/api/cloud/plaza/file/${id}`);
  for (const secret of ['password', 'authorId', 'clientId', 'deleteToken', 'storagePath']) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('空内容和无效附件在访问数据库之前拒绝', async t => {
  let connections = 0;
  const f = await fixture(t, { connectDB: async () => { connections++; } });
  await assert.rejects(f.publishCloud({ text: ' \n ' }), { status: 400 });
  await assert.rejects(f.publishPlaza({ text: ' \n ' }), { status: 400 });
  await assert.rejects(f.publishCloud({ files: [{ name: 'x', buffer: 'invalid' }] }), { status: 400 });
  await assert.rejects(f.publishCloud({ files: [{ name: 'a\x00.txt', buffer: Buffer.from('a') }] }), { status: 400 });
  assert.equal(connections, 0);
});

test('按需读取附件真实字节，元数据与二进制内容分别返回且不修改数据库', async t => {
  const f = await fixture(t);
  const bytes = [Buffer.from([0, 255, 128, 42]), Buffer.from('中文附件')];
  const published = await f.publishCloud({ text: '图片和资料', files: [
    { name: 'image.png', mimeType: 'image/png', buffer: bytes[0] },
    { name: 'note.txt', mimeType: 'text/plain', buffer: bytes[1] }
  ] });
  const original = JSON.stringify(f.model.records);
  const result = await f.readCloud({ password: published.password, includeFileContent: true });
  assert.equal(result.fileContents.length, 2);
  result.fileContents.forEach((file, index) => {
    assert.deepEqual(Buffer.from(file.data, 'base64'), bytes[index]);
    assert.equal(file.id, published.files[index].id);
    assert.equal(file.name, published.files[index].name);
    assert.equal(file.mimeType, published.files[index].mimeType);
    assert.equal(file.url, published.files[index].url);
    assert.equal('data' in result.files[index], false);
  });
  assert.equal(JSON.stringify(f.model.records), original);
  assert.equal(JSON.stringify(result).includes('storagePath'), false);
  assert.deepEqual(await f.readCloud({ password: published.password }), published);
});

test('附件缺失时提供清楚错误，关闭内容读取仍可读取文字和元数据', async t => {
  const f = await fixture(t);
  const published = await f.publishCloud({ text: '保留文字', files: [{ name: 'missing.txt', buffer: Buffer.from('x') }] });
  await fs.unlink(path.join(f.directory, f.model.records[0].files[0].storagePath));
  assert.deepEqual(await f.readCloud({ password: published.password, includeFileContent: false }), published);
  await assert.rejects(f.readCloud({ password: published.password, includeFileContent: true }), error => {
    assert.equal(error.status, 404);
    assert.match(error.message, /文件不存在/);
    assert.equal(error.message.includes(f.directory), false);
    return true;
  });
});

test('附件内容读取拒绝路径穿越、非法扩展和不匹配的文件标识', async t => {
  const f = await fixture(t);
  const published = await f.publishCloud({ files: [{ name: 'safe.txt', buffer: Buffer.from('safe') }] });
  const stored = f.model.records[0].files[0];
  const invalidPaths = ['../secret.txt', `${'b'.repeat(24)}.txt`, `${stored.fileId}.txt/../secret`, `${stored.fileId}.verylongextension`];
  for (const storagePath of invalidPaths) {
    stored.storagePath = storagePath;
    await assert.rejects(f.readCloud({ password: published.password, includeFileContent: true }), error => {
      assert.equal(error.status, 400);
      assert.match(error.message, /存储信息无效/);
      assert.equal(error.message.includes(storagePath), false);
      return true;
    });
  }
  assert.equal((await f.readCloud({ password: published.password })).fileContents, undefined);
});

test('真实磁盘大小超过单个附件限制时建议仅查看附件链接', async t => {
  const f = await fixture(t);
  const published = await f.publishCloud({ files: [{ name: 'large.bin', buffer: Buffer.from('x') }] });
  await fs.truncate(path.join(f.directory, f.model.records[0].files[0].storagePath), MAX_FILE_BYTES + 1);
  await assert.rejects(f.readCloud({ password: published.password, includeFileContent: true }), error => {
    assert.equal(error.status, 413);
    assert.match(error.message, /关闭 includeFileContent/);
    assert.equal(error.message.includes(f.directory), false);
    return true;
  });
  assert.deepEqual(await f.readCloud({ password: published.password }), published);
});

test('真实磁盘附件合计大小超过限制时拒绝读取内容', async t => {
  const f = await fixture(t);
  const published = await f.publishCloud({ files: [0, 1, 2].map(index => ({ name: `${index}.bin`, buffer: Buffer.from('x') })) });
  for (let index = 0; index < 3; index++) await fs.truncate(path.join(f.directory, f.model.records[0].files[index].storagePath), index < 2 ? MAX_FILE_BYTES : 1);
  await assert.rejects(f.readCloud({ password: published.password, includeFileContent: true }), { status: 413 });
});
