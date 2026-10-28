const express = require('express');
const { timingSafeEqual, createHash } = require('node:crypto');
const { createMcpHandler } = require('@modelcontextprotocol/server');
const { toNodeHandler } = require('@modelcontextprotocol/node');
const { createNeonMcpServer, MAX_REQUEST_BYTES } = require('./server');
const { readMcpConfig, createServices } = require('./settings');

function createMcpRouter(options = {}) {
  const config = options.config === undefined ? readMcpConfig() : options.config;
  const router = express.Router();
  if (!config) {
    router.all('/', (_req, res) => res.status(404).json({ error: 'MCP HTTP 服务未启用' }));
    return router;
  }
  const publicUrl = new URL(config.publicBaseUrl);
  const expectedToken = createHash('sha256').update(config.token).digest();
  const services = options.services || createServices(config);
  const handler = createMcpHandler(() => createNeonMcpServer(services), {
    maxRequestBodySize: MAX_REQUEST_BYTES,
    onerror: error => console.error('MCP 协议请求失败:', error.name)
  });
  const nodeHandler = toNodeHandler(handler);
  router.close = () => handler.close();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    // 站点根地址固定在配置中，不能信任调用方传入的 Host 或代理头。
    if (req.headers.host?.toLowerCase() !== publicUrl.host.toLowerCase()) return res.status(403).json({ error: 'MCP 请求 Host 不在允许范围内' });
    if (req.headers.origin !== undefined && req.headers.origin !== publicUrl.origin) return res.status(403).json({ error: 'MCP 请求来源不在允许范围内' });
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !timingSafeEqual(createHash('sha256').update(token).digest(), expectedToken)) {
      res.set('WWW-Authenticate', 'Bearer realm="neon-mcp"');
      return res.status(401).json({ error: 'MCP 访问令牌无效' });
    }
    next();
  });
  router.use(express.json({ limit: MAX_REQUEST_BYTES, strict: true }));
  router.all('/', (req, res, next) => { nodeHandler(req, res, req.body).catch(next); });
  router.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'MCP 请求不能超过 48 MiB' : status === 400 ? 'MCP 请求 JSON 格式无效' : 'MCP 服务暂时不可用' });
  });
  return router;
}

module.exports = { createMcpRouter };
