const express = require('express');
const { createMcpHandler } = require('@modelcontextprotocol/server');
const { toNodeHandler } = require('@modelcontextprotocol/node');
const { createNeonMcpServer, MAX_REQUEST_BYTES } = require('./server');
const { readMcpConfig, createServices } = require('./settings');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestUuid(headers) {
  const authorization = headers.authorization;
  const headerUuid = headers['x-neon-user-uuid'];
  let bearerUuid;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') return null;
    const match = /^Bearer ([0-9a-f-]{36})$/i.exec(authorization);
    if (!match) return null;
    bearerUuid = match[1].toLowerCase();
  }
  if (headerUuid !== undefined && (typeof headerUuid !== 'string' || !UUID_PATTERN.test(headerUuid))) return null;
  const normalizedHeader = typeof headerUuid === 'string' ? headerUuid.toLowerCase() : undefined;
  if (bearerUuid && normalizedHeader && bearerUuid !== normalizedHeader) return null;
  const uuid = bearerUuid || normalizedHeader;
  return uuid && UUID_PATTERN.test(uuid) ? uuid : null;
}

function createMcpRouter(options = {}) {
  const config = options.config === undefined ? readMcpConfig() : options.config;
  const router = express.Router();
  if (!config) {
    router.all('/', (_req, res) => res.status(404).json({ error: 'MCP HTTP 服务未启用' }));
    return router;
  }
  const publicUrl = new URL(config.publicBaseUrl);
  const profiles = options.profileRepository || require('../user/profileRepository').profileRepository;
  let servicesForUser = options.servicesForUser;
  if (!servicesForUser) {
    const cloudService = require('./cloud').createCloudService({ publicBaseUrl: config.publicBaseUrl });
    servicesForUser = ownerUuid => createServices(config, { ownerUuid, profileRepository: profiles, cloudService });
  }
  const handler = createMcpHandler(async ({ authInfo }) => {
    // SDK 会为每次请求传入经过验证的身份，不能使用跨请求共享的当前用户变量。
    const ownerUuid = authInfo?.extra?.ownerUuid;
    if (typeof ownerUuid !== 'string' || !UUID_PATTERN.test(ownerUuid)) throw new Error('MCP 请求缺少已验证身份');
    return createNeonMcpServer(await servicesForUser(ownerUuid));
  }, {
    maxRequestBodySize: MAX_REQUEST_BYTES,
    onerror: error => console.error('MCP 协议请求失败:', error.name)
  });
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: MAX_REQUEST_BYTES });
  router.close = () => handler.close();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    // 站点根地址固定在配置中，不能信任调用方传入的 Host 或代理头。
    if (req.headers.host?.toLowerCase() !== publicUrl.host.toLowerCase()) return res.status(403).json({ error: 'MCP 请求 Host 不在允许范围内' });
    if (req.headers.origin !== undefined && req.headers.origin !== publicUrl.origin) return res.status(403).json({ error: 'MCP 请求来源不在允许范围内' });
    const ownerUuid = requestUuid(req.headers);
    if (!ownerUuid) {
      res.set('WWW-Authenticate', 'Bearer realm="luojh-mcp"');
      return res.status(401).json({ error: 'MCP 身份无效，请使用个人中心的 UUID' });
    }
    Promise.resolve().then(() => profiles.getByUuid(ownerUuid)).then(profile => {
      if (!profile || profile.isSystem) {
        res.set('WWW-Authenticate', 'Bearer realm="luojh-mcp"');
        return res.status(401).json({ error: 'MCP 身份无效，请使用个人中心的 UUID' });
      }
      req.auth = {
        token: ownerUuid,
        clientId: 'luojh-mcp-user',
        scopes: ['neon:tools'],
        resource: new URL('/mcp', publicUrl),
        extra: { ownerUuid }
      };
      next();
    }).catch(next);
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
