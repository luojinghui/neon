const DEFAULT_PUBLIC_BASE_URL = 'https://luojh.com';

function readMcpConfig(env = process.env) {
  const enabled = String(env.MCP_ENABLED ?? 'true').trim().toLowerCase();
  if (!['true', 'false'].includes(enabled)) throw new Error('MCP_ENABLED 必须为 true 或 false');
  if (enabled === 'false') return null;
  let url;
  try { url = new URL(env.MCP_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL); } catch { throw new Error('MCP_PUBLIC_BASE_URL 必须为有效的网站根地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MCP_PUBLIC_BASE_URL 必须为 HTTP 或 HTTPS 站点根地址，不能包含凭据、路径或查询参数');
  }
  return { publicBaseUrl: url.origin };
}

function createServices(config, options = {}) {
  const { createCloudService } = require('./cloud');
  const { createMomentService } = require('./moments');
  return {
    cloudService: options.cloudService || createCloudService({ publicBaseUrl: config.publicBaseUrl }),
    momentService: createMomentService({ ownerUuid: options.ownerUuid, publicBaseUrl: config.publicBaseUrl, ...(options.profileRepository ? { profileRepository: options.profileRepository } : {}) })
  };
}

module.exports = { DEFAULT_PUBLIC_BASE_URL, readMcpConfig, createServices };
