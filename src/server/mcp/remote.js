const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
const { McpServer, fromJsonSchema } = require('@modelcontextprotocol/server');

const DEFAULT_MCP_URL = 'https://luojh.com/mcp';
const MAX_REQUEST_BYTES = 48 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRemoteConfig(env = process.env) {
  const uuid = String(env.NEON_UUID || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(uuid)) throw Object.assign(new Error('请配置 NEON_UUID：在 https://luojh.com 的个人中心复制自己的 UUID'), { code: 'NEON_UUID_INVALID' });
  let url;
  try { url = new URL(env.NEON_MCP_URL || DEFAULT_MCP_URL); } catch { throw Object.assign(new Error('NEON_MCP_URL 地址无效'), { code: 'NEON_URL_INVALID' }); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('NEON_MCP_URL 需使用 HTTPS，不得包含凭据、查询参数或片段；本机调试可使用 HTTP'), { code: 'NEON_URL_INVALID' });
  }
  return { uuid, url: url.href };
}

async function createRemoteGateway({ uuid, url = DEFAULT_MCP_URL, fetch: fetchFn } = {}) {
  const client = new Client({ name: 'neon-remote-client', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${uuid}` }, redirect: 'error' },
    ...(fetchFn ? { fetch: fetchFn } : {}),
    onInsufficientScope: 'throw',
    maxStepUpRetries: 0,
    // 断线后不恢复请求流，发布失败需由用户先到网站确认结果，避免重复发布。
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 }
  });
  const tools = [];
  try {
    await client.connect(transport);
    let cursor;
    const cursors = new Set();
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('工具分页异常');
      if (cursor) cursors.add(cursor);
    } while (cursor);
  } catch {
    await client.close().catch(() => {});
    throw Object.assign(new Error('无法连接 Neon MCP，请检查网络、网站服务及个人中心 UUID 是否有效'), { code: 'NEON_REMOTE_UNAVAILABLE' });
  }

  return {
    close: () => client.close(),
    createServer() {
      const server = new McpServer({ name: 'neon-remote', version: '1.0.0' }, {
        instructions: '本地进程仅代理 Neon 网站的 MCP 工具；数据库与附件由网站管理。发布会创建真实内容，失败时请先到网站确认结果，再决定是否重试。'
      });
      for (const tool of tools) {
        server.registerTool(tool.name, {
          title: tool.title,
          description: tool.description,
          inputSchema: fromJsonSchema(tool.inputSchema),
          ...(tool.outputSchema ? { outputSchema: fromJsonSchema(tool.outputSchema) } : {}),
          annotations: tool.annotations,
          icons: tool.icons,
          _meta: tool._meta
        }, async (argumentsValue, ctx) => {
          try {
            // 显式工具定义会关闭 SDK 的 HEADER_MISMATCH 自动重发分支。
            return await client.callTool({ name: tool.name, arguments: argumentsValue }, { toolDefinition: tool, signal: ctx.mcpReq.signal });
          } catch {
            return { isError: true, content: [{ type: 'text', text: '远程请求失败，请检查网络或 UUID；若执行发布，请先到网站确认结果后再重试' }] };
          }
        });
      }
      return server;
    }
  };
}

module.exports = { DEFAULT_MCP_URL, MAX_REQUEST_BYTES, readRemoteConfig, createRemoteGateway };
