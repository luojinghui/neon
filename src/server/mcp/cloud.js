const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomInt } = require('node:crypto');
const { MAX_FILE_BYTES, MAX_TOTAL_BYTES } = require('./attachments');
const { runFileExclusive } = require('../storage/filePersistence');

const CLOUD_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_ATTEMPTS = 64;

class CloudServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CloudServiceError';
    this.status = status;
  }
}

function normalizeInput(input = {}) {
  const { text = '', files = [] } = input;
  if (typeof text !== 'string' || !Array.isArray(files)) throw new CloudServiceError('发布内容格式无效');
  if (!text.trim() && !files.length) throw new CloudServiceError('请输入文字或提供附件');
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\x00-\x1f]/.test(file.name) || !Buffer.isBuffer(file.buffer)) {
      throw new CloudServiceError('附件必须包含有效名称和文件内容');
    }
    if (file.mimeType !== undefined && (typeof file.mimeType !== 'string' || /[\r\n\x00]/.test(file.mimeType))) throw new CloudServiceError('附件类型无效');
    if (file.relativePath !== undefined && (typeof file.relativePath !== 'string' || /\x00/.test(file.relativePath))) throw new CloudServiceError('附件相对路径无效');
  }
  return { text, files };
}

function passwordQuery(password) {
  if (typeof password !== 'string' || !/^[a-z0-9]{2,4}$/i.test(password.trim())) throw new CloudServiceError('请输入 2–4 位字母或数字查看密码');
  return new RegExp(`^${password.trim().toLowerCase()}$`, 'i');
}

function createCloudService(options = {}) {
  const connectDB = options.connectDB || require('../models').connectDB;
  const cloudModel = options.cloudModel || require('../models/cloud').CloudMessage;
  const plazaRepository = options.plazaRepository || require('../cloud/plazaRepository').plazaRepository;
  const uploadDirectory = options.uploadDirectory || path.join(process.cwd(), 'upload');
  const now = options.now || Date.now;
  const createPassword = options.createPassword || (() => randomInt(36 ** 4).toString(36).padStart(4, '0'));
  const baseUrl = (options.publicBaseUrl || '').replace(/\/+$/, '');
  if (baseUrl) {
    let parsed;
    try { parsed = new URL(baseUrl); } catch { throw new CloudServiceError('站点地址必须是有效的 HTTP 或 HTTPS 地址'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new CloudServiceError('站点地址必须使用 HTTP 或 HTTPS');
  }
  const url = (pathname) => baseUrl ? new URL(pathname, `${baseUrl}/`).href : pathname;
  const publicFiles = (files = [], plaza = false) => files.map((file) => ({
    id: file.fileId,
    name: file.fileName,
    mimeType: file.mimeType || 'application/octet-stream',
    size: file.fileSize,
    url: url(`/api/cloud/${plaza ? 'plaza/' : ''}file/${encodeURIComponent(file.fileId)}`),
    ...(file.relativePath ? { relativePath: file.relativePath } : {})
  }));
  const publicCloud = (record) => ({
    messageId: record.messageId,
    password: record.password,
    expiresAt: new Date(record.expireAt).toISOString(),
    text: record.content || '',
    files: publicFiles(record.files),
    viewUrl: url(`/cloud?pwd=${encodeURIComponent(record.password)}`)
  });

  async function publishCloud(input) {
    const { text, files } = normalizeInput(input);
    await connectDB();
    const written = [];
    const records = [];
    let persisted = false;
    try {
      if (files.length) await fs.mkdir(uploadDirectory, { recursive: true });
      for (const file of files) {
        const fileId = randomBytes(12).toString('hex');
        const extension = path.extname(file.name);
        // 存储名称完全由服务端生成，原始名称仅用于展示。
        const storagePath = `${fileId}${/^\.[a-zA-Z0-9]{1,12}$/.test(extension) ? extension : ''}`;
        const filePath = path.join(uploadDirectory, storagePath);
        const handle = await fs.open(filePath, 'wx');
        written.push(filePath);
        try { await handle.writeFile(file.buffer); } finally { await handle.close(); }
        records.push({
          fileId, fileName: file.name, fileSize: file.buffer.length,
          mimeType: file.mimeType || 'application/octet-stream',
          relativePath: file.relativePath || file.name, storagePath
        });
      }
      // HTTP 与 stdio 进程共享上传目录锁，串行完成密码查重和保存。
      const record = await runFileExclusive(path.join(uploadDirectory, '.mcp-cloud-password'), async () => {
        for (let attempt = 0; attempt < PASSWORD_ATTEMPTS; attempt++) {
          const password = createPassword();
          if (typeof password !== 'string' || !/^[a-z0-9]{4}$/.test(password)) throw new Error('查看密码生成失败');
          if (await cloudModel.findOne({ password: passwordQuery(password) })) continue;
          const createdAt = new Date(now());
          const data = {
            messageId: randomBytes(12).toString('hex'),
            messageType: files.length ? (text.trim() ? 'mixed' : 'file') : 'text',
            content: text, files: records, userId: null, password, createdAt,
            expireAt: new Date(createdAt.getTime() + CLOUD_LIFETIME_MS)
          };
          try {
            const created = await cloudModel.create(data);
            persisted = true;
            return created;
          } catch (error) {
            // 若部署已增加密码唯一索引，索引冲突也重新分配密码。
            if (error.code === 11000 && (error.keyPattern?.password || error.keyValue?.password)) continue;
            throw error;
          }
        }
        throw new CloudServiceError('暂时无法分配查看密码，请稍后重试', 503);
      });
      return publicCloud(record);
    } catch (error) {
      // 保存后的锁释放失败仍需传播，但不能删除已被数据库引用的附件。
      if (!persisted) await Promise.all(written.map(filePath => fs.unlink(filePath).catch(cleanupError => {
        if (cleanupError.code !== 'ENOENT') console.error('MCP 云传附件回滚失败:', cleanupError.code);
      })));
      throw error;
    }
  }

  async function readFileContents(record, metadata) {
    const contents = [];
    let totalBytes = 0;
    for (let index = 0; index < (record.files || []).length; index++) {
      const file = record.files[index];
      const stored = /^([a-f0-9]{24})(\.[a-zA-Z0-9]{1,12})?$/.exec(file.storagePath || '');
      if (!stored || stored[1] !== file.fileId) throw new CloudServiceError('云传附件存储信息无效，无法读取内容');
      const filePath = path.join(uploadDirectory, file.storagePath);
      let handle;
      try {
        // 拒绝符号链接和特殊文件，避免读取上传目录之外的内容。
        const entry = await fs.lstat(filePath);
        if (!entry.isFile() || entry.isSymbolicLink()) throw new CloudServiceError('云传附件存储信息无效，无法读取内容');
        handle = await fs.open(filePath, 'r');
        const stat = await handle.stat();
        if (!stat.isFile() || stat.ino !== entry.ino || stat.dev !== entry.dev) throw new CloudServiceError('云传附件读取期间发生变化，请重试', 409);
        if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) {
          throw new CloudServiceError('附件内容超过读取限制（单个 16 MiB，合计 32 MiB），请关闭 includeFileContent 后通过附件链接查看', 413);
        }
        // 多预留一个字节检测文件增长，避免文件在检查后变大而无限读入内存。
        const buffer = Buffer.alloc(stat.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = await handle.read(buffer, length, buffer.length - length, null);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length > stat.size) throw new CloudServiceError('云传附件读取期间发生变化，请重试', 409);
        totalBytes += length;
        contents.push({
          id: metadata[index].id, name: metadata[index].name,
          mimeType: metadata[index].mimeType,
          data: buffer.subarray(0, length).toString('base64'), url: metadata[index].url
        });
      } catch (error) {
        if (error instanceof CloudServiceError) throw error;
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new CloudServiceError('云传附件文件不存在或已被清理，可关闭 includeFileContent 仅查看文字和附件信息', 404);
        throw new CloudServiceError('暂时无法读取云传附件，请稍后重试', 500);
      } finally {
        if (handle) await handle.close();
      }
    }
    return contents;
  }

  async function readCloud({ password, includeFileContent = false } = {}) {
    const query = passwordQuery(password);
    if (typeof includeFileContent !== 'boolean') throw new CloudServiceError('includeFileContent 必须为布尔值');
    await connectDB();
    const record = await cloudModel.findOne({ password: query, expireAt: { $gt: new Date(now()) } });
    if (!record) throw new CloudServiceError('未找到云传内容，密码可能有误或内容已过期', 404);
    const result = publicCloud(record);
    if (includeFileContent) result.fileContents = await readFileContents(record, result.files);
    return result;
  }

  async function publishPlaza(input) {
    const { text, files } = normalizeInput(input);
    await connectDB();
    const uploads = files.map(file => ({
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
      size: file.buffer.length,
      arrayBuffer: async () => file.buffer
    }));
    const item = await plazaRepository.create(text, uploads, files.map(file => file.relativePath || file.name));
    return {
      messageId: item.messageId,
      expiresAt: new Date(item.expireAt).toISOString(),
      text: item.content || '',
      files: publicFiles(item.files, true),
      viewUrl: url(`/cloud/plaza/${encodeURIComponent(item.messageId)}`)
    };
  }

  return { publishCloud, readCloud, publishPlaza };
}

module.exports = { createCloudService, CloudServiceError };
