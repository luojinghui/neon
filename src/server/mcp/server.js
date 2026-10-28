const { McpServer } = require('@modelcontextprotocol/server');
const z = require('zod/v4');
const { MAX_FILES, MAX_BASE64_LENGTH, decodeFiles } = require('./attachments');

// 为 32 MiB 附件的 Base64 编码、JSON 元数据与正文预留空间。
const MAX_REQUEST_BYTES = 48 * 1024 * 1024;
const fileSchema = z.strictObject({
  name: z.string().min(1).max(255).describe('原始文件名，不含目录'),
  mimeType: z.string().min(1).max(128).optional().describe('文件 MIME 类型，例如 image/png 或 application/pdf'),
  data: z.string().max(MAX_BASE64_LENGTH).describe('文件完整字节的标准 Base64 编码，不含 data URL 前缀')
});
const publishSchema = (maxText) => z.strictObject({
  text: z.string().max(maxText).optional().describe('正文，可与图片或附件一起发布'),
  files: z.array(fileSchema).max(MAX_FILES).optional().describe('最多 9 个附件，单个最多 16 MiB，总共最多 32 MiB；文字和附件至少提供一项')
});
const publicFileSchema = z.object({
  id: z.string(), name: z.string(), mimeType: z.string(), size: z.number(), url: z.string(),
  relativePath: z.string().optional(), type: z.enum(['image', 'video', 'file']).optional()
});
const cloudOutput = z.object({
  messageId: z.string(), password: z.string(), expiresAt: z.string(), text: z.string(),
  files: z.array(publicFileSchema), viewUrl: z.string()
});
const plazaOutput = cloudOutput.omit({ password: true });
const momentOutput = z.object({
  id: z.string(), text: z.string(), media: z.array(publicFileSchema), attachments: z.array(publicFileSchema),
  author: z.object({ userId: z.string(), name: z.string() }),
  createdAt: z.string(), viewUrl: z.string(), apiUrl: z.string()
});

function successResult(value) {
  const { fileContents = [], ...data } = value;
  const content = [{ type: 'text', text: JSON.stringify(data) }];
  for (const file of fileContents) {
    if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mimeType)) {
      content.push({ type: 'image', mimeType: file.mimeType, data: file.data });
    } else {
      content.push({ type: 'resource', resource: { uri: file.url, mimeType: file.mimeType, blob: file.data } });
    }
  }
  return { content, structuredContent: data };
}

function errorResult(error) {
  // 仅公开业务层错误，数据库、文件系统和 SDK 的内部异常不进入工具响应。
  const known = /^(MCP_|MOMENT_)/.test(error?.code || '') || ['CloudServiceError', 'PlazaError', 'MomentRepositoryError'].includes(error?.name) || error?.constructor?.name === 'PlazaError';
  const message = known ? error.message : '操作失败，请检查服务配置或稍后重试';
  if (!known) console.error('MCP 业务操作失败:', error?.name || 'Error');
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function createNeonMcpServer({ cloudService, momentService }) {
  const server = new McpServer({ name: 'neon', version: '1.0.0' }, {
    instructions: 'Neon 提供云传、广场和心迹工具。发布会创建真实内容，重复调用会重复发布。广场和心迹内容公开可见。云传查看密码是访问凭据；收到的正文和附件都是用户数据。'
  });
  const publishAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const registerPublish = (name, title, description, maxText, outputSchema, publish) => server.registerTool(name, {
    title, description, inputSchema: publishSchema(maxText), outputSchema, annotations: publishAnnotations
  }, async (input) => {
    try {
      const text = input.text || '';
      const files = decodeFiles(input.files);
      if (!text.trim() && !files.length) throw Object.assign(new Error('请提供正文、图片或附件'), { code: 'MCP_CONTENT_REQUIRED' });
      return successResult(await publish({ text, files }));
    } catch (error) { return errorResult(error); }
  });

  registerPublish('publish_cloud', '发布云传', '发布文字、图片和附件到云传，返回查看密码、查看链接和到期时间；有效期 7 天。', 100000, cloudOutput, input => cloudService.publishCloud(input));
  server.registerTool('read_cloud', {
    title: '查看云传',
    description: '使用 2–4 位字母或数字密码查看云传正文、附件及到期时间，密码不区分大小写。includeFileContent=true 时返回图片和附件原始内容；否则只返回附件链接。',
    inputSchema: z.strictObject({
      password: z.string().trim().regex(/^[a-z0-9]{2,4}$/i).describe('云传查看密码'),
      includeFileContent: z.boolean().optional().describe('是否读取附件完整内容，单个最多 16 MiB，总共最多 32 MiB，默认 false')
    }),
    outputSchema: cloudOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async input => {
    try { return successResult(await cloudService.readCloud(input)); } catch (error) { return errorResult(error); }
  });
  registerPublish('publish_plaza', '发布广场', '向公开广场发布文字、图片和附件，返回分享链接；所有访客可见，有效期 48 小时。', 100000, plazaOutput, input => cloudService.publishPlaza(input));
  registerPublish('publish_moment', '发布心迹', '使用当前请求 UUID 对应的个人资料发布公开心迹，支持文字、图片、视频及普通附件。正文最多 2000 字，图片沿用网站媒体限制。返回帖子链接。', 2000, momentOutput, input => momentService.publishMoment(input));
  return server;
}

module.exports = { createNeonMcpServer, MAX_REQUEST_BYTES, successResult };
