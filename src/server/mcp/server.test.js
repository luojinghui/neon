const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { createMcpRouter } = require('./http');
const { readMcpConfig } = require('./settings');

const TOKEN = 'a'.repeat(64);
const file = { id: 'file1', name: 'notes.txt', mimeType: 'text/plain', size: 5, url: 'https://neon.example/api/file1', relativePath: 'notes.txt', type: 'file' };
const cloud = { messageId: 'cloud1', password: 'abcd', text: '正文', files: [file], expiresAt: '2026-11-01T00:00:00.000Z', viewUrl: 'https://neon.example/cloud?pwd=abcd' };

async function fixture(t) {
  const calls = [];
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
  const router = createMcpRouter({ config: { token: TOKEN, publicBaseUrl: base }, services });
  app.use('/mcp', router);
  t.after(async () => { await router.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  async function client(mode = 'auto') {
    const connection = new Client({ name: 'neon-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    await connection.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
    t.after(() => connection.close());
    return connection;
  }
  return { base, calls, client };
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

test('HTTP 校验访问令牌、Host、Origin、JSON，未配置时关闭端点', async t => {
  const { base } = await fixture(t);
  const request = (headers = {}, body = '{}') => fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await request()).status, 401);
  assert.equal((await request({ Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await request({ Authorization: `Bearer ${TOKEN}`, Origin: 'https://evil.example' })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/mcp`, { method: 'POST', headers: { Host: 'evil.example', Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.once('error', reject);
    req.end('{}');
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await request({ Authorization: `Bearer ${TOKEN}` }, '{bad')).status, 400);
  assert.equal(readMcpConfig({}), null);
  assert.throws(() => readMcpConfig({ MCP_AUTH_TOKEN: 'short' }), /MCP_AUTH_TOKEN/);
  assert.throws(() => readMcpConfig({ MCP_AUTH_TOKEN: TOKEN, MCP_PUBLIC_BASE_URL: 'https://name:secret@example.com' }), /根地址/);
  assert.throws(() => readMcpConfig({ MCP_AUTH_TOKEN: TOKEN, MCP_PUBLIC_BASE_URL: base, MCP_OWNER_UUID: 'invalid' }), /UUID/);
  const app = express();
  app.use('/mcp', createMcpRouter({ config: null }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/mcp`)).status, 404);
});

test('stdio 子进程可握手并发现工具，缺少心迹身份时拒绝发布', async t => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../../../scripts/neon-mcp.cjs')], env: { MCP_PUBLIC_BASE_URL: 'http://127.0.0.1:3000', MCP_OWNER_UUID: '' }, stderr: 'pipe' });
  const connection = new Client({ name: 'neon-stdio-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(() => connection.close());
  await connection.connect(transport);
  assert.equal((await connection.listTools()).tools.length, 4);
  const result = await connection.callTool({ name: 'publish_moment', arguments: { text: '不应发布的测试内容' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /MCP_OWNER_UUID/);
  const large = await connection.callTool({ name: 'publish_moment', arguments: { files: [{ name: 'stdio-large.bin', data: Buffer.alloc(8 * 1024 * 1024).toString('base64') }] } });
  assert.equal(large.isError, true);
  assert.match(large.content[0].text, /MCP_OWNER_UUID/);
});
