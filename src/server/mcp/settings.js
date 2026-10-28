function readMcpConfig(env = process.env, { stdio = false } = {}) {
  const token = String(env.MCP_AUTH_TOKEN || '').trim();
  if (!stdio && !token) return null;
  if (token && !/^[A-Za-z0-9._~-]{32,256}$/.test(token)) throw new Error('MCP_AUTH_TOKEN 需为 32–256 位字母、数字或 ._~- 字符');
  let url;
  try { url = new URL(env.MCP_PUBLIC_BASE_URL); } catch { throw new Error('请配置 MCP_PUBLIC_BASE_URL，例如 http://127.0.0.1:3000'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MCP_PUBLIC_BASE_URL 必须为 HTTP 或 HTTPS 站点根地址，不能包含凭据、路径或查询参数');
  }
  const ownerUuid = String(env.MCP_OWNER_UUID || '').trim().toLowerCase();
  if (ownerUuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ownerUuid)) throw new Error('MCP_OWNER_UUID 必须为已有个人资料的有效 UUID');
  return { token, publicBaseUrl: url.origin, ownerUuid };
}

function createServices(config) {
  const { createCloudService } = require('./cloud');
  const { createMomentService } = require('./moments');
  return {
    cloudService: createCloudService({ publicBaseUrl: config.publicBaseUrl }),
    momentService: createMomentService({ ownerUuid: config.ownerUuid, publicBaseUrl: config.publicBaseUrl })
  };
}

module.exports = { readMcpConfig, createServices };
