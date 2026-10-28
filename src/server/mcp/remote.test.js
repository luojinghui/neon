const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server');
const { toNodeHandler } = require('@modelcontextprotocol/node');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const z = require('zod/v4');
const { DEFAULT_MCP_URL, MAX_REQUEST_BYTES, readRemoteConfig, createRemoteGateway } = require('./remote');

const UUID = '11111111-1111-4111-8111-111111111111';
const TOOLS = ['publish_cloud', 'read_cloud', 'publish_plaza', 'publish_moment'];

async function fixture(t) {
  const calls = [];
  const authorization = [];
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'remote-fixture', version: '1.0.0' });
    for (const name of TOOLS) server.registerTool(name, {
      description: `远程工具 ${name}`,
      inputSchema: z.object({ text: z.string().optional(), data: z.string().optional(), fail: z.boolean().optional() }),
      outputSchema: z.object({ tool: z.string(), text: z.string() }),
      annotations: { readOnlyHint: name === 'read_cloud', idempotentHint: name === 'read_cloud' }
    }, async (input) => ({
      content: [
        { type: 'text', text: input.text || '' },
        { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
        { type: 'resource', resource: { uri: 'https://luojh.com/file', mimeType: 'text/plain', blob: 'aGVsbG8=' } }
      ],
      structuredContent: { tool: name, text: input.text || '' }
    }));
    return server;
  }, { maxRequestBodySize: MAX_REQUEST_BYTES });
  const app = express();
  app.use(express.json({ limit: MAX_REQUEST_BYTES }));
  const nodeHandler = toNodeHandler(handler);
  app.all('/mcp', (req, res, next) => {
    authorization.push(req.headers.authorization);
    if (req.headers.authorization !== `Bearer ${UUID}`) return res.status(401).json({ error: '未知 UUID' });
    if (req.body?.method === 'tools/call') {
      calls.push(req.body.params);
      if (req.body.params.arguments?.fail) return res.status(503).json({ error: `不应泄漏 ${UUID} mongodb://secret@internal` });
    }
    nodeHandler(req, res, req.body).catch(next);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  t.after(async () => { await handler.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { url, calls, authorization };
}

test('远程客户端只需 UUID，默认连接 luojh.com 并拒绝泄漏凭据的地址形式', () => {
  assert.deepEqual(readRemoteConfig({ NEON_UUID: UUID }), { uuid: UUID, url: DEFAULT_MCP_URL });
  assert.throws(() => readRemoteConfig({}), /NEON_UUID/);
  assert.throws(() => readRemoteConfig({ NEON_UUID: 'not-a-uuid' }), /NEON_UUID/);
  for (const url of ['http://example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?uuid=secret', 'https://example.com/mcp#secret', 'file:///mcp']) {
    assert.throws(() => readRemoteConfig({ NEON_UUID: UUID, NEON_MCP_URL: url }), /NEON_MCP_URL/);
  }
  assert.equal(readRemoteConfig({ NEON_UUID: UUID, NEON_MCP_URL: 'http://127.0.0.1:12345/mcp' }).url, 'http://127.0.0.1:12345/mcp');
});

test('真实 HTTP 代理保留工具定义、参数及图文资源结果，并兼容新旧本地客户端', async t => {
  const remote = await fixture(t);
  const gateway = await createRemoteGateway({ uuid: UUID, url: remote.url });
  t.after(() => gateway.close());
  const proxy = createMcpHandler(() => gateway.createServer(), { maxRequestBodySize: MAX_REQUEST_BYTES });
  t.after(() => proxy.close());
  for (const mode of ['auto', 'legacy']) {
    const client = new Client({ name: 'gateway-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    await client.connect(new StreamableHTTPClientTransport(new URL('http://local.test/mcp'), { fetch: (url, init) => proxy.fetch(new Request(url, init)) }));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), TOOLS.toSorted());
    assert.equal(tools.find(tool => tool.name === 'read_cloud').annotations.readOnlyHint, true);
    for (const name of TOOLS) {
      const result = await client.callTool({ name, arguments: { text: '原文\r\n{"value":1}' } });
      assert.notEqual(result.isError, true);
      assert.equal(result.structuredContent.tool, name);
      assert.equal(result.structuredContent.text, '原文\r\n{"value":1}');
      assert.deepEqual(result.content.map(item => item.type).slice(0, 3), ['text', 'image', 'resource']);
      assert.equal(result.content[1].data, 'aGVsbG8=');
      assert.equal(result.content[2].resource.blob, 'aGVsbG8=');
    }
    await client.close();
  }
  assert.ok(remote.authorization.every(header => header === `Bearer ${UUID}`));
});

test('发布网络失败不自动重试，工具错误不暴露 UUID 或远程内部错误', async t => {
  const remote = await fixture(t);
  const gateway = await createRemoteGateway({ uuid: UUID, url: remote.url });
  t.after(() => gateway.close());
  const proxy = createMcpHandler(() => gateway.createServer());
  t.after(() => proxy.close());
  const client = new Client({ name: 'gateway-error-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL('http://local.test/mcp'), { fetch: (url, init) => proxy.fetch(new Request(url, init)) }));
  await client.listTools();
  const result = await client.callTool({ name: 'publish_cloud', arguments: { text: '只发送一次', fail: true } });
  assert.equal(result.isError, true);
  assert.equal(remote.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${UUID}|mongodb|secret|internal`));
});

test('stdio 入口仅用 UUID 代理网站，不读取数据库配置或创建本地数据', async t => {
  const remote = await fixture(t);
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-remote-cwd-'));
  t.after(async () => {
    assert.equal(path.dirname(cwd), os.tmpdir());
    assert.ok(path.basename(cwd).startsWith('neon-remote-cwd-'));
    await fs.rm(cwd, { recursive: true, force: true });
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(__dirname, '../../../scripts/neon-mcp.cjs')],
    env: { NEON_UUID: UUID, NEON_MCP_URL: remote.url, MONGODB_URI: 'deliberately-invalid-and-unused' },
    cwd,
    stderr: 'pipe',
    maxBufferSize: MAX_REQUEST_BYTES
  });
  let stderr = '';
  transport.stderr.on('data', data => { stderr += data.toString(); });
  const client = new Client({ name: 'remote-stdio-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
  const input = { text: '远程发布', data: Buffer.alloc(8 * 1024 * 1024).toString('base64') };
  const result = await client.callTool({ name: 'publish_moment', arguments: input });
  assert.equal(result.structuredContent.text, input.text);
  assert.deepEqual(remote.calls.at(-1).arguments, input);
  await client.close();
  assert.deepEqual(await fs.readdir(cwd), []);
  assert.doesNotMatch(stderr, new RegExp(`${UUID}|deliberately-invalid|mongodb`));
});
