const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { CloudMessage, CLOUD_MESSAGE_LIFETIME_MS } = require('../models/cloud');
const { CloudPlazaMessage } = require('../models/cloudPlaza');
const { PlazaRepository, PLAZA_LIFETIME_MS } = require('../cloud/plazaRepository');
const { MomentRepository } = require('../moment/momentRepository');
const { ProfileRepository } = require('../user/profileRepository');
const { createCloudService } = require('./cloud');
const { createMomentService } = require('./moments');
const { createMcpRouter } = require('./http');

// 必须显式指定独立本地 MongoDB 端口；绝不读取或复用应用 MONGODB_URI。
const port = process.env.MCP_TEST_MONGO_PORT;
const integration = (name, run) => test(name, { skip: !port }, run);
let connection, cloudModel, plazaModel, directory, mongoUri;

before(async () => {
  if (!port) return;
  assert.match(port, /^[0-9]{4,5}$/);
  assert.ok(Number(port) <= 65535);
  const database = `neon_mcp_test_${randomBytes(6).toString('hex')}`;
  mongoUri = `mongodb://127.0.0.1:${port}/${database}`;
  connection = await mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  cloudModel = connection.model('CloudMessage', CloudMessage.schema);
  plazaModel = connection.model('CloudPlazaMessage', CloudPlazaMessage.schema);
  await Promise.all([cloudModel.init(), plazaModel.init()]);
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-mcp-integration-'));
});

after(async () => {
  if (connection) {
    try { await connection.dropDatabase(); } finally { await connection.close(); }
  }
  if (directory) {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('neon-mcp-integration-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

integration('真实 MongoDB 与 HTTP MCP 客户端完成四工具图文附件发布和密码读取', async (t) => {
  const root = path.join(directory, 'http');
  const cloudUploads = path.join(root, 'cloud');
  const plazaRepository = new PlazaRepository({ model: plazaModel, uploadDirectory: path.join(root, 'plaza') });
  const moments = new MomentRepository({ dataFile: path.join(root, 'moments.json'), uploadDirectory: path.join(root, 'moments') });
  const profiles = new ProfileRepository({ dataFile: path.join(root, 'profiles.json') });
  const ownerUuid = randomUUID();
  const profile = profiles.ensureProfile({ uuid: ownerUuid, userId: 'integrationAuthor', name: '隔离测试作者' });
  await profiles.writeQueue;

  const app = express();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = randomBytes(32).toString('hex');
  const router = createMcpRouter({
    config: { token, publicBaseUrl: base, ownerUuid },
    services: {
      cloudService: createCloudService({ connectDB: async () => {}, cloudModel, plazaRepository, uploadDirectory: cloudUploads, publicBaseUrl: base }),
      momentService: createMomentService({ momentRepository: moments, profileRepository: profiles, ownerUuid, publicBaseUrl: base })
    }
  });
  app.use('/mcp', router);
  const client = new Client({ name: 'mongo-integration', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(async () => {
    await client.close();
    await router.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await Promise.all([moments.writeQueue, moments.cleanupQueue, profiles.writeQueue]);
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  assert.equal((await client.listTools()).tools.length, 4);
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const document = Buffer.from('隔离测试附件\n{"ok":true}', 'utf8');
  const args = { text: '原文\r\n隔离集成测试', files: [
    { name: '图片.png', mimeType: 'image/png', data: image },
    { name: '说明.txt', mimeType: 'text/plain', data: document.toString('base64') }
  ] };

  const published = await client.callTool({ name: 'publish_cloud', arguments: args });
  assert.notEqual(published.isError, true);
  const cloud = published.structuredContent;
  assert.match(cloud.password, /^[a-z0-9]{4}$/);
  const storedCloud = await cloudModel.findOne({ messageId: cloud.messageId }).lean();
  assert.equal(storedCloud.content, args.text);
  assert.equal(storedCloud.expireAt - storedCloud.createdAt, CLOUD_MESSAGE_LIFETIME_MS);
  assert.equal(storedCloud.files.length, 2);
  assert.deepEqual(await fs.readFile(path.join(cloudUploads, storedCloud.files[1].storagePath)), document);
  const read = await client.callTool({ name: 'read_cloud', arguments: { password: cloud.password.toUpperCase(), includeFileContent: true } });
  assert.notEqual(read.isError, true);
  assert.equal(read.structuredContent.text, args.text);
  assert.deepEqual(read.content.map((item) => item.type), ['text', 'image', 'resource']);
  assert.equal(read.content[1].data, image);
  assert.deepEqual(Buffer.from(read.content[2].resource.blob, 'base64'), document);
  assert.doesNotMatch(JSON.stringify(read), /storagePath|ownerUuid/);

  const plazaResult = await client.callTool({ name: 'publish_plaza', arguments: args });
  assert.notEqual(plazaResult.isError, true);
  const plaza = plazaResult.structuredContent;
  const storedPlaza = await plazaModel.findOne({ messageId: plaza.messageId }).lean();
  assert.equal(storedPlaza.expireAt - storedPlaza.createdAt, PLAZA_LIFETIME_MS);
  assert.equal((await plazaRepository.get(plaza.messageId)).files.length, 2);
  const plazaFile = await plazaRepository.getFile(plaza.files[1].id);
  assert.deepEqual(await fs.readFile(plazaFile.filePath), document);

  const momentResult = await client.callTool({ name: 'publish_moment', arguments: args });
  assert.notEqual(momentResult.isError, true);
  const moment = momentResult.structuredContent;
  assert.equal(moment.author.userId, profile.userId);
  assert.equal(moment.media.length, 1);
  assert.equal(moment.attachments.length, 1);
  assert.equal(new URL(moment.viewUrl).searchParams.get('moment'), moment.id);
  const reloaded = new MomentRepository({ dataFile: moments.dataFile, uploadDirectory: moments.uploadDirectory });
  assert.equal(reloaded.getMoment(moment.id).ownerUuid, ownerUuid);
  const attachment = reloaded.getFileAttachment(moment.id, moment.attachments[0].id);
  assert.deepEqual(await fs.readFile(attachment.filePath), document);
  await reloaded.deleteMoment(moment.id, ownerUuid);
  assert.equal(reloaded.getMoment(moment.id), null);
  await assert.rejects(fs.stat(attachment.filePath), { code: 'ENOENT' });
  await plazaRepository.remove(plaza.messageId);
  await assert.rejects(plazaRepository.get(plaza.messageId), { status: 404 });
});

integration('stdio 真实连接隔离 MongoDB 发布云传后，EOF 关闭数据库连接并退出子进程', async (t) => {
  const root = path.join(directory, 'stdio');
  await fs.mkdir(root, { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(__dirname, '../../../scripts/neon-mcp.cjs')],
    env: {
      MONGODB_URI: mongoUri,
      MCP_PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
      MCP_OWNER_UUID: '',
      USER_PROFILE_DATA_FILE: path.join(root, 'profiles.json'),
      MOMENT_DATA_FILE: path.join(root, 'moments.json'),
      MOMENT_UPLOAD_DIRECTORY: path.join(root, 'moment-uploads'),
      CLOUD_PLAZA_UPLOAD_DIRECTORY: path.join(root, 'plaza-uploads')
    },
    stderr: 'pipe'
  });
  let stderr = '';
  transport.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const client = new Client({ name: 'mongo-stdio-integration', version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
  t.after(() => client.close());
  await client.connect(transport);
  const published = await client.callTool({ name: 'publish_cloud', arguments: { text: '只写入临时 MongoDB 的 stdio 验收文本' } });
  assert.notEqual(published.isError, true);
  assert.ok(await cloudModel.findOne({ messageId: published.structuredContent.messageId }));
  const read = await client.callTool({ name: 'read_cloud', arguments: { password: published.structuredContent.password } });
  assert.equal(read.structuredContent.text, '只写入临时 MongoDB 的 stdio 验收文本');
  assert.match(stderr, /MongoDB connected/);
  const pid = transport.pid;
  const started = Date.now();
  await client.close();
  const duration = Date.now() - started;
  t.diagnostic(`建立 MongoDB 连接后关闭 stdio 用时 ${duration} ms`);
  // SDK 在等待 2 秒后才强制终止；提前退出证明 EOF 清理没有挂住连接池。
  assert.ok(duration < 1800, `关闭耗时 ${duration} ms，不应依赖 SDK 强制终止`);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
