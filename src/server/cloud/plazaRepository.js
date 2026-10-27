const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { CloudPlazaMessage } = require('../models/cloudPlaza');

const PLAZA_LIFETIME_MS = 48 * 60 * 60 * 1000;
const FILE_ID_PATTERN = /^[a-f0-9]{32}$/;
const ID_PATTERN = /^(?:[A-Za-z0-9_-]{8}|[a-f0-9]{32})$/;
const newFileId = () => randomBytes(16).toString('hex');
const newMessageId = () => randomBytes(6).toString('base64url');
const MESSAGE_ID_ATTEMPTS = 5;

class PlazaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function publicMessage(record) {
  return {
    messageId: record.messageId,
    content: record.content,
    files: record.files.map(({ fileId, fileName, fileSize, mimeType, relativePath }) => ({ fileId, fileName, fileSize, mimeType, relativePath })),
    createdAt: new Date(record.createdAt).toISOString(),
    expireAt: new Date(record.expireAt).toISOString()
  };
}

class PlazaRepository {
  constructor({ model = CloudPlazaMessage, uploadDirectory = process.env.CLOUD_PLAZA_UPLOAD_DIRECTORY || path.join(process.cwd(), 'upload', 'cloud-plaza'), now = Date.now, messageIdGenerator = newMessageId } = {}) {
    this.model = model;
    this.uploadDirectory = uploadDirectory;
    this.now = now;
    this.messageIdGenerator = messageIdGenerator;
    this.cleanupPromise = null;
  }

  activeFilter() { return { deletedAt: null, expireAt: { $gt: new Date(this.now()) } }; }

  async list(cursor, pageSize = 20) {
    const filter = this.activeFilter();
    if (cursor) {
      let position;
      try { position = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new PlazaError('分页参数无效'); }
      if (!position || typeof position.at !== 'string' || !Number.isFinite(Date.parse(position.at)) || !ID_PATTERN.test(position.id)) throw new PlazaError('分页参数无效');
      filter.$or = [{ createdAt: { $lt: new Date(position.at) } }, { createdAt: new Date(position.at), messageId: { $lt: position.id } }];
    }
    const limit = Math.max(1, Math.min(50, Number.isFinite(pageSize) ? Math.floor(pageSize) : 20));
    const records = await this.model.find(filter).sort({ createdAt: -1, messageId: -1 }).limit(limit + 1).lean();
    const items = records.slice(0, limit).map(publicMessage);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: records.length > limit && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.messageId })).toString('base64url') : null,
      serverNow: new Date(this.now()).toISOString()
    };
  }

  async create(content, files = [], relativePaths = []) {
    if (typeof content !== 'string' || (!content.trim() && !files.length)) throw new PlazaError('请输入内容或选择文件');
    const written = [];
    const records = [];
    try {
      if (files.length) await fs.mkdir(this.uploadDirectory, { recursive: true });
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const fileId = newFileId();
        const extension = path.extname(file.name);
        const storagePath = `${fileId}${/^\.[a-zA-Z0-9]{1,12}$/.test(extension) ? extension : ''}`;
        const filePath = path.join(this.uploadDirectory, storagePath);
        const handle = await fs.open(filePath, 'wx');
        written.push(filePath);
        try { await handle.writeFile(Buffer.from(await file.arrayBuffer())); } finally { await handle.close(); }
        records.push({ fileId, fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream', relativePath: relativePaths[index] || file.name, storagePath });
      }
      // Upload time does not reduce the card's lifetime.
      const createdAt = new Date(this.now());
      for (let attempt = 0; attempt < MESSAGE_ID_ATTEMPTS; attempt++) {
        const messageId = this.messageIdGenerator();
        try {
          const record = await this.model.create({ messageId, content, files: records, createdAt, expireAt: new Date(createdAt.getTime() + PLAZA_LIFETIME_MS), deletedAt: null });
          return publicMessage(record);
        } catch (error) {
          const collision = error.code === 11000 && (error.keyPattern?.messageId || error.keyValue?.messageId !== undefined);
          if (!collision || attempt === MESSAGE_ID_ATTEMPTS - 1) throw error;
        }
      }
    } catch (error) {
      await Promise.all(written.map(filePath => fs.unlink(filePath).catch(cleanupError => {
        if (cleanupError.code !== 'ENOENT') console.error('Plaza upload rollback failed:', cleanupError.code);
      })));
      throw error;
    }
  }

  async get(messageId) {
    if (!ID_PATTERN.test(messageId)) throw new PlazaError('分享链接无效', 400);
    const record = await this.model.findOne({ messageId, ...this.activeFilter() }).lean();
    if (!record) throw new PlazaError('内容已过期或被删除', 404);
    return publicMessage(record);
  }

  filePath(file) {
    if (!/^[a-f0-9]{32}(\.[a-zA-Z0-9]{1,12})?$/.test(file.storagePath)) throw new Error('Invalid plaza storage path');
    return path.join(this.uploadDirectory, file.storagePath);
  }

  async getFile(fileId) {
    if (!FILE_ID_PATTERN.test(fileId)) throw new PlazaError('附件不存在或已失效', 404);
    const record = await this.model.findOne({ 'files.fileId': fileId, ...this.activeFilter() }).lean();
    if (!record) throw new PlazaError('附件不存在或已失效', 404);
    const file = record.files.find(item => item.fileId === fileId);
    return { file, filePath: this.filePath(file) };
  }

  async purge(record) {
    await Promise.all(record.files.map(file => fs.unlink(this.filePath(file)).catch(error => { if (error.code !== 'ENOENT') throw error; })));
    await this.model.deleteOne({ messageId: record.messageId });
  }

  async remove(messageId) {
    if (!ID_PATTERN.test(messageId)) throw new PlazaError('分享链接无效');
    const record = await this.model.findOneAndUpdate({ messageId, deletedAt: null }, { $set: { deletedAt: new Date(this.now()) } }, { new: true }).lean();
    if (record) {
      // A failed physical deletion must not make the card visible again. The cleaner retries it.
      await this.purge(record).catch(error => console.error('Plaza file cleanup will retry:', error.code || error.message));
    }
  }

  async cleanupExpired() {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      const records = await this.model.find({ $or: [{ expireAt: { $lte: new Date(this.now()) } }, { deletedAt: { $ne: null } }] }).limit(100).lean();
      await Promise.all(records.map(record => this.purge(record).catch(error => console.error('Plaza cleanup failed:', error.code || error.message))));
    })();
    try { await this.cleanupPromise; } finally { this.cleanupPromise = null; }
  }
}

const plazaRepository = new PlazaRepository();
module.exports = { PlazaRepository, PlazaError, plazaRepository, PLAZA_LIFETIME_MS, ID_PATTERN };
