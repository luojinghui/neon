#!/usr/bin/env node
'use strict';

// 标准输出专供 MCP JSON-RPC，本地进程只代理远程网站工具。
console.log = console.info = console.debug = (...args) => console.error(...args);

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Neon MCP 需要 Node.js 20 或更高版本');
  const { serveStdio, StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
  const { readRemoteConfig, createRemoteGateway, MAX_REQUEST_BYTES } = require('../src/server/mcp/remote');
  const gateway = await createRemoteGateway(readRemoteConfig());
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: MAX_REQUEST_BYTES });
  const handle = serveStdio(() => gateway.createServer(), {
    transport,
    onerror: error => console.error('MCP 标准输入输出连接异常:', error.name)
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await handle.close(); } finally { await gateway.close(); }
  };
  const shutdown = () => stop().catch(() => {
    console.error('Neon MCP 连接关闭时清理失败');
    process.exitCode = 1;
  });
  const onclose = transport.onclose;
  transport.onclose = () => { onclose?.(); void shutdown(); };
  process.stdin.once('end', () => { void shutdown(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown(); });
}

main().catch((error) => {
  const message = /^(NEON_UUID_INVALID|NEON_URL_INVALID|NEON_REMOTE_UNAVAILABLE)$/.test(error?.code || '') ? error.message : 'Neon MCP 启动失败：需要 Node.js 20 或更新版本，请检查依赖与 NEON_UUID 配置';
  console.error(message);
  process.exitCode = 1;
});
