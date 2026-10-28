const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { createMcpRouter } = require('./http');
const { readMcpConfig } = require('./settings');

const UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';
const file = { id: 'file1', name: 'notes.txt', mimeType: 'text/plain', size: 5, url: 'https://neon.example/api/file1', relativePath: 'notes.txt', type: 'file' };
const cloud = { messageId: 'cloud1', password: 'abcd', text: '正文', files: [file], expiresAt: '2026-11-01T00:00:00.000Z', viewUrl: 'https://neon.example/cloud?pwd=abcd' };

async function fixture(t) {
  const calls = [];
  const profiles = new Map([
    [UUID, { uuid: UUID, userId: 'public1' }],
    [OTHER_UUID, { uuid: OTHER_UUID, userId: 'public2' }]
  ]);
  const services = {
    cloudService: {
      async publishCloud(input) { calls.push(input); return cloud; },
      async readCloud(input) {
        calls.push(input);
        if (input.password === 'fail') throw new Error('mongodb://secret:password@internal-host');
        return input.includeFileContent ? { ...cloud, fileContents: [
          { ...file, data: Buffer.from('hello').toString('base64') },
          { ...file, mimeType: 'image/png', data: 'aGVsbG8=' }
        ] } : cloud;
      },
      async publishPlaza(input) { calls.push(input); const { password, ...result } = cloud; return result; }
    },
    momentService: { async publishMoment(input) {
      calls.push(input);
      return { id: 'moment1', text: input.text, media: [], attachments: [file], author: { userId: 'public1', name: '作者' }, createdAt: '2026-10-28T00:00:00.000Z', viewUrl: 'https://neon.example/moments?moment=moment1', apiUrl: 'https://neon.example/api/moments/moment1' };
    } }
  };
  const app = express();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const router = createMcpRouter({
    config: { publicBaseUrl: base },
    profileRepository: { getByUuid: uuid => profiles.get(uuid) },
    servicesForUser: ownerUuid => ({
      cloudService: services.cloudService,
      momentService: { async publishMoment(input) {
        await new Promise(resolve => setTimeout(resolve, ownerUuid === UUID ? 10 : 1));
        const result = await services.momentService.publishMoment(input);
        return { ...result, author: { ...result.author, userId: profiles.get(ownerUuid).userId } };
      } }
    })
  });
  app.use('/mcp', router);
  t.after(async () => { await router.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  async function client(mode = 'auto', uuid = UUID) {
    const connection = new Client({ name: 'neon-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    await connection.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${uuid}` } } }));
    t.after(() => connection.close());
    return connection;
  }
  return { base, calls, client, profiles };
}

test('真实 HTTP 客户端发现四工具并执行图文发布、密码查询和心迹发布', async t => {
  const { client, calls } = await fixture(t);
  const connection = await client();
  const { tools } = await connection.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['publish_cloud', 'publish_moment', 'publish_plaza', 'read_cloud']);
  assert.equal(tools.find(tool => tool.name === 'read_cloud').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'publish_cloud').annotations.idempotentHint, false);
  assert.ok(tools.every(tool => tool.outputSchema));
  for (const name of ['publish_cloud', 'publish_plaza', 'publish_moment']) {
    const result = await connection.callTool({ name, arguments: { text: '正文', files: [{ name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' }] } });
    assert.notEqual(result.isError, true);
    assert.equal(calls.at(-1).files[0].buffer.toString(), 'hello');
    assert.ok(result.structuredContent.viewUrl);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
  const read = await connection.callTool({ name: 'read_cloud', arguments: { password: 'ABCD', includeFileContent: true } });
  assert.deepEqual(read.content.map(item => item.type), ['text', 'resource', 'image']);
  assert.equal('fileContents' in read.structuredContent, false);
  assert.equal(read.content[1].resource.blob, 'aGVsbG8=');
});

test('兼容 2025 系列 MCP 客户端握手与工具调用', async t => {
  const { client } = await fixture(t);
  const connection = await client('legacy');
  assert.equal((await connection.listTools()).tools.length, 4);
  const result = await connection.callTool({ name: 'read_cloud', arguments: { password: 'abcd' } });
  assert.equal(result.structuredContent.password, 'abcd');
});

test('参数错误在发布前拒绝，内部错误不泄漏连接或凭据', async t => {
  const { client, calls } = await fixture(t);
  const connection = await client();
  for (const args of [{}, { files: [{ name: '../bad', data: 'aGVsbG8=' }] }, { files: [{ name: 'bad', data: 'not base64' }] }, { text: '正文', ownerUuid: '冒用身份' }]) {
    const result = await connection.callTool({ name: 'publish_cloud', arguments: args });
    assert.equal(result.isError, true);
  }
  assert.equal(calls.length, 0);
  const result = await connection.callTool({ name: 'read_cloud', arguments: { password: 'fail' } });
  assert.equal(result.isError, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|password@|internal-host/);
});

test('附件超过 SDK 默认 4 MiB 请求上限仍可通过配置后的 HTTP 传输', async t => {
  const { client, calls } = await fixture(t);
  const connection = await client();
  const data = Buffer.alloc(4 * 1024 * 1024, 7).toString('base64');
  const result = await connection.callTool({ name: 'publish_cloud', arguments: { files: [{ name: 'large.bin', data }] } });
  assert.notEqual(result.isError, true);
  assert.equal(calls[0].files[0].buffer.length, 4 * 1024 * 1024);
});

test('HTTP 仅用已有用户 UUID 认证，并校验 Host、Origin、JSON 和显式停用配置', async t => {
  const { base } = await fixture(t);
  const request = (headers = {}, body = '{}') => fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await request()).status, 401);
  assert.equal((await request({ Authorization: 'Bearer wrong' })).status, 401);
  const unknown = await request({ Authorization: 'Bearer 33333333-3333-4333-8333-333333333333' });
  assert.equal(unknown.status, 401);
  assert.equal((await request({ Authorization: `Bearer ${UUID}`, 'x-neon-user-uuid': OTHER_UUID })).status, 401);
  assert.equal((await request({ Authorization: `Bearer ${UUID}`, Origin: 'https://evil.example' })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/mcp`, { method: 'POST', headers: { Host: 'evil.example', Authorization: `Bearer ${UUID}`, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.once('error', reject);
    req.end('{}');
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await request({ Authorization: `Bearer ${UUID}` }, '{bad')).status, 400);
  assert.deepEqual(readMcpConfig({}), { publicBaseUrl: 'https://luojh.com' });
  assert.equal(readMcpConfig({ MCP_ENABLED: 'false' }), null);
  assert.throws(() => readMcpConfig({ MCP_ENABLED: 'invalid' }), /MCP_ENABLED/);
  assert.throws(() => readMcpConfig({ MCP_PUBLIC_BASE_URL: 'https://name:secret@example.com' }), /根地址/);
  assert.deepEqual(readMcpConfig({ MCP_AUTH_TOKEN: 'old-token', MCP_OWNER_UUID: OTHER_UUID }), { publicBaseUrl: 'https://luojh.com' });
  const app = express();
  app.use('/mcp', createMcpRouter({ config: null }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/mcp`)).status, 404);
});

test('两个 UUID 并发调用时，心迹作者按每次请求隔离且身份不能由工具参数覆盖', async t => {
  const { client } = await fixture(t);
  const [one, two] = await Promise.all([client(), client('auto', OTHER_UUID)]);
  const results = await Promise.all([one, two, one, two].map((connection, index) => connection.callTool({ name: 'publish_moment', arguments: { text: `消息 ${index}` } })));
  assert.deepEqual(results.map(result => result.structuredContent.author.userId), ['public1', 'public2', 'public1', 'public2']);
  for (const name of ['publish_cloud', 'publish_plaza', 'publish_moment']) {
    const rejected = await one.callTool({ name, arguments: { text: '冒用作者', ownerUuid: OTHER_UUID } });
    assert.equal(rejected.isError, true);
  }
  assert.ok(results.every(result => !JSON.stringify(result).includes(UUID) && !JSON.stringify(result).includes(OTHER_UUID)));
});

test('每次 HTTP 请求重新校验 UUID，资料删除后原连接也不能继续调用', async t => {
  const { client, profiles } = await fixture(t);
  const connection = await client();
  profiles.delete(UUID);
  await assert.rejects(connection.callTool({ name: 'publish_cloud', arguments: { text: '不应发布' } }));
});

test('stdio 缺少 UUID 时清楚退出，不读取本机数据库或等待远程连接', async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../../scripts/neon-mcp.cjs')], { env: { ...process.env, NEON_UUID: '', MCP_OWNER_UUID: '', MONGODB_URI: '故意无效的本机配置' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.notEqual(exitCode, 0);
  assert.equal(stdout, '');
  assert.match(stderr, /NEON_UUID|UUID/);
  assert.doesNotMatch(stderr, /故意无效|MongoDB|mongoose/);
});
