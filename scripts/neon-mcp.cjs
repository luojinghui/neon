#!/usr/bin/env node
'use strict';

// 标准输出专供 MCP JSON-RPC，现有数据库连接日志也统一转到标准错误。
console.log = console.info = console.debug = (...args) => console.error(...args);
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Neon MCP 需要 Node.js 20 或更高版本');
  const { serveStdio, StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
  const { createNeonMcpServer, MAX_REQUEST_BYTES } = require('../src/server/mcp/server');
  const { readMcpConfig, createServices } = require('../src/server/mcp/settings');
  const { disconnectDB } = require('../src/server/models');
  const config = readMcpConfig(process.env, { stdio: true });
  const services = createServices(config);
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: MAX_REQUEST_BYTES });
  const handle = serveStdio(() => createNeonMcpServer(services), {
    transport,
    onerror: error => console.error('MCP 标准输入输出连接异常:', error.name)
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await handle.close(); } finally { await disconnectDB(); }
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

main().catch(() => {
  console.error('Neon MCP 启动失败：请检查 Node.js 版本、依赖和 MCP 环境变量配置');
  process.exitCode = 1;
});
