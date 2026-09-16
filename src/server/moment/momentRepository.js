const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { runFileExclusive, writeFileAtomic } = require('../storage/filePersistence');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const UPLOAD_PATTERN = /^\/uploads\/moments\/([A-Za-z0-9_-]{16}-[A-Za-z0-9_-]{8}\.(?:jpg|png|webp|gif|mp4|webm|mov|m4a|mp3|ogg|wav|aac))$/;
const MAX_TEXT_LENGTH = 500;
const MAX_COMMENT_LENGTH = 500;
const MAX_MEDIA_ITEMS = 9;

const MIME_TYPES = new Map([
  ['image/jpeg', { extension: 'jpg', kind: 'image', maxBytes: 12 * 1024 * 1024 }],
  ['image/png', { extension: 'png', kind: 'image', maxBytes: 12 * 1024 * 1024 }],
  ['image/webp', { extension: 'webp', kind: 'image', maxBytes: 12 * 1024 * 1024 }],
  ['image/gif', { extension: 'gif', kind: 'image', maxBytes: 20 * 1024 * 1024 }],
  ['video/mp4', { extension: 'mp4', kind: 'video', maxBytes: 100 * 1024 * 1024 }],
  ['video/webm', { extension: 'webm', kind: 'video', maxBytes: 100 * 1024 * 1024 }],
  ['video/quicktime', { extension: 'mov', kind: 'video', maxBytes: 100 * 1024 * 1024 }],
  ['audio/webm', { extension: 'webm', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/mp4', { extension: 'm4a', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/x-m4a', { extension: 'm4a', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/mpeg', { extension: 'mp3', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/ogg', { extension: 'ogg', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/wav', { extension: 'wav', kind: 'audio', maxBytes: 20 * 1024 * 1024 }],
  ['audio/aac', { extension: 'aac', kind: 'audio', maxBytes: 20 * 1024 * 1024 }]
]);

class MomentRepositoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MomentRepositoryError';
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MomentRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.MOMENT_DATA_FILE || path.join(process.cwd(), '.data', 'moments.json');
    this.uploadDirectory = options.uploadDirectory || process.env.MOMENT_UPLOAD_DIRECTORY || path.join(process.cwd(), 'public', 'uploads', 'moments');
    this.now = options.now || (() => Date.now());
    this.moments = new Map();
    this.writeQueue = Promise.resolve();
    this.cleanupQueue = Promise.resolve();
    this.lastLoadedMtime = -1;
    this.loadError = null;
    this.load(true);
  }

  load(force = false) {
    try {
      if (!fs.existsSync(this.dataFile)) {
        if (force) {
          this.moments = new Map();
          this.lastLoadedMtime = -1;
        }
        this.loadError = null;
        return;
      }
      const mtime = fs.statSync(this.dataFile).mtimeMs;
      if (!force && mtime <= this.lastLoadedMtime) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      if (!data || !Array.isArray(data.moments)) throw new Error('moments must be an array');
      const moments = new Map();
      for (const raw of data.moments) {
        const moment = this.normalizeStoredMoment(raw);
        if (moments.has(moment.id)) throw new Error(`duplicate moment ${moment.id}`);
        moments.set(moment.id, moment);
      }
      this.moments = moments;
      this.lastLoadedMtime = mtime;
      this.loadError = null;
    } catch (error) {
      this.loadError = error;
      console.error('Moments could not be loaded:', error.message);
    }
  }

  ensureLoaded(force = false) {
    this.load(force);
    if (this.loadError) throw new MomentRepositoryError('心迹数据暂时无法读取，请稍后重试', 'MOMENT_STORAGE_UNAVAILABLE');
  }

  runMutation(task) {
    const operation = runFileExclusive(this.dataFile, async () => {
      this.ensureLoaded(true);
      return task();
    }).catch((error) => {
      if (error instanceof MomentRepositoryError) throw error;
      console.error('Moment storage operation failed:', error.message);
      throw new MomentRepositoryError('心迹数据保存失败，请稍后重试', 'MOMENT_STORAGE_UNAVAILABLE');
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async persistUnlocked() {
    await writeFileAtomic(this.dataFile, JSON.stringify({ version: 1, moments: [...this.moments.values()] }, null, 2));
    this.lastLoadedMtime = fs.statSync(this.dataFile).mtimeMs;
  }

  listMoments(options = {}) {
    this.ensureLoaded();
    const ownerUuid = options.ownerUuid ? this.requireUuid(options.ownerUuid) : '';
    const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(options.pageSize, 10) || 20));
    const all = [...this.moments.values()]
      .filter((moment) => !ownerUuid || moment.ownerUuid === ownerUuid)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
    const offset = (page - 1) * pageSize;
    return {
      items: all.slice(offset, offset + pageSize).map(clone),
      total: all.length,
      page,
      pageSize,
      hasMore: offset + pageSize < all.length
    };
  }

  getMoment(idValue) {
    this.ensureLoaded();
    const id = this.requireId(idValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const moment = this.moments.get(id);
    return moment ? clone(moment) : null;
  }

  async createMoment(input = {}, attachments = {}) {
    const ownerUuid = this.requireUuid(input.ownerUuid);
    const text = this.optionalText(input.text, MAX_TEXT_LENGTH, '心迹文字不能超过 500 个字符', 'MOMENT_TEXT_INVALID');
    const location = this.normalizeLocation(input.location);
    const mediaInput = Array.isArray(attachments.media) ? attachments.media : [];
    const voiceInput = attachments.voice || null;
    if (mediaInput.length > MAX_MEDIA_ITEMS) throw new MomentRepositoryError(`每条心迹最多上传 ${MAX_MEDIA_ITEMS} 个图片或视频`, 'MOMENT_MEDIA_INVALID');
    if (!text && mediaInput.length === 0 && !voiceInput) throw new MomentRepositoryError('写点文字，或添加图片、视频、语音后再发布', 'MOMENT_CONTENT_EMPTY');

    return this.runMutation(async () => {
      const id = this.createId(this.moments);
      const stored = [];
      try {
        const media = [];
        for (const item of mediaInput) {
          const attachment = await this.writeAttachment(id, item, ['image', 'video']);
          media.push(attachment);
          stored.push(attachment.url);
        }
        let voice = null;
        if (voiceInput) {
          voice = await this.writeAttachment(id, voiceInput, ['audio']);
          voice.durationMs = this.normalizeDuration(input.voiceDurationMs);
          stored.push(voice.url);
        }
        const now = new Date(this.now()).toISOString();
        const moment = { id, ownerUuid, text, media, voice, location, comments: [], likedBy: [], createdAt: now, updatedAt: now };
        this.moments.set(id, moment);
        try {
          await this.persistUnlocked();
        } catch (error) {
          this.moments.delete(id);
          throw error;
        }
        return clone(moment);
      } catch (error) {
        await Promise.all(stored.map((url) => this.deleteStoredAttachment(url)));
        throw error;
      }
    });
  }

  async deleteMoment(idValue, actorUuidValue = '', options = {}) {
    const id = this.requireId(idValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const actorUuid = actorUuidValue ? this.requireUuid(actorUuidValue) : '';
    return this.runMutation(async () => {
      const moment = this.moments.get(id);
      if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
      if (options.isAdmin !== true && moment.ownerUuid !== actorUuid) throw new MomentRepositoryError('只能删除自己发布的心迹', 'MOMENT_FORBIDDEN');
      this.moments.delete(id);
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.moments.set(id, moment);
        throw error;
      }
      await this.deleteMomentAttachments(moment);
      return clone(moment);
    });
  }

  async deleteByOwner(ownerUuidValue) {
    const ownerUuid = this.requireUuid(ownerUuidValue);
    return this.runMutation(async () => {
      const removed = [...this.moments.values()].filter((moment) => moment.ownerUuid === ownerUuid);
      const changed = [];
      let commentCount = removed.reduce((sum, moment) => sum + moment.comments.length, 0);
      for (const moment of removed) this.moments.delete(moment.id);

      for (const moment of this.moments.values()) {
        const removedComments = moment.comments.filter((comment) => comment.ownerUuid === ownerUuid);
        const likedBy = moment.likedBy.filter((uuid) => uuid !== ownerUuid);
        if (removedComments.length === 0 && likedBy.length === moment.likedBy.length) continue;
        const removedIds = new Set(removedComments.map((comment) => comment.id));
        const comments = moment.comments
          .filter((comment) => comment.ownerUuid !== ownerUuid)
          .map((comment) =>
            removedIds.has(comment.replyToCommentId)
              ? { ...comment, replyToCommentId: '', replyToOwnerUuid: '' }
              : comment
          );
        changed.push({ id: moment.id, moment });
        commentCount += removedComments.length;
        this.moments.set(moment.id, { ...moment, comments, likedBy, updatedAt: new Date(this.now()).toISOString() });
      }

      if (removed.length === 0 && changed.length === 0) return { count: 0, commentCount: 0 };
      try {
        await this.persistUnlocked();
      } catch (error) {
        for (const moment of removed) this.moments.set(moment.id, moment);
        for (const item of changed) this.moments.set(item.id, item.moment);
        throw error;
      }
      for (const moment of removed) await this.deleteMomentAttachments(moment);
      return { count: removed.length, commentCount };
    });
  }

  async setMomentLiked(momentIdValue, actorUuidValue, liked) {
    const momentId = this.requireId(momentIdValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const actorUuid = this.requireUuid(actorUuidValue);
    if (typeof liked !== 'boolean') throw new MomentRepositoryError('点赞状态必须为布尔值', 'MOMENT_LIKE_INVALID');
    return this.runMutation(async () => {
      const moment = this.moments.get(momentId);
      if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
      const alreadyLiked = moment.likedBy.includes(actorUuid);
      if (alreadyLiked === liked) return { liked, likeCount: moment.likedBy.length };
      const likedBy = liked ? [...moment.likedBy, actorUuid] : moment.likedBy.filter((uuid) => uuid !== actorUuid);
      this.moments.set(momentId, { ...moment, likedBy, updatedAt: new Date(this.now()).toISOString() });
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.moments.set(momentId, moment);
        throw error;
      }
      return { liked, likeCount: likedBy.length };
    });
  }

  listComments(momentIdValue) {
    this.ensureLoaded();
    const moment = this.requireMoment(momentIdValue);
    return moment.comments.map(clone);
  }

  async createComment(momentIdValue, ownerUuidValue, input = {}) {
    const momentId = this.requireId(momentIdValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const ownerUuid = this.requireUuid(ownerUuidValue);
    const text = this.requireText(input.text, MAX_COMMENT_LENGTH, '评论不能为空且不能超过 500 个字符', 'COMMENT_TEXT_INVALID');
    const requestedReplyId = String(input.replyToCommentId || '').trim();
    const replyToCommentId = requestedReplyId ? this.requireId(requestedReplyId, '回复的评论无效', 'COMMENT_ID_INVALID') : '';

    return this.runMutation(async () => {
      const moment = this.moments.get(momentId);
      if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
      const replyTarget = replyToCommentId ? moment.comments.find((comment) => comment.id === replyToCommentId) : null;
      if (replyToCommentId && !replyTarget) throw new MomentRepositoryError('回复的评论不存在或已被删除', 'COMMENT_NOT_FOUND');
      const now = new Date(this.now()).toISOString();
      const comment = {
        id: this.createId(new Set(moment.comments.map((item) => item.id))),
        ownerUuid,
        text,
        replyToCommentId,
        replyToOwnerUuid: replyTarget?.ownerUuid || '',
        createdAt: now,
        updatedAt: now
      };
      const updated = { ...moment, comments: [...moment.comments, comment], updatedAt: now };
      this.moments.set(momentId, updated);
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.moments.set(momentId, moment);
        throw error;
      }
      return clone(comment);
    });
  }

  async updateComment(momentIdValue, commentIdValue, actorUuidValue, input = {}) {
    const momentId = this.requireId(momentIdValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const commentId = this.requireId(commentIdValue, '评论地址无效', 'COMMENT_ID_INVALID');
    const actorUuid = this.requireUuid(actorUuidValue);
    const text = this.requireText(input.text, MAX_COMMENT_LENGTH, '评论不能为空且不能超过 500 个字符', 'COMMENT_TEXT_INVALID');
    return this.runMutation(async () => {
      const moment = this.moments.get(momentId);
      if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
      const index = moment.comments.findIndex((comment) => comment.id === commentId);
      if (index < 0) throw new MomentRepositoryError('评论不存在或已被删除', 'COMMENT_NOT_FOUND');
      const current = moment.comments[index];
      if (current.ownerUuid !== actorUuid) throw new MomentRepositoryError('只能编辑自己的评论', 'COMMENT_FORBIDDEN');
      const updatedComment = { ...current, text, updatedAt: new Date(this.now()).toISOString() };
      const comments = [...moment.comments];
      comments[index] = updatedComment;
      this.moments.set(momentId, { ...moment, comments, updatedAt: updatedComment.updatedAt });
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.moments.set(momentId, moment);
        throw error;
      }
      return clone(updatedComment);
    });
  }

  async deleteComment(momentIdValue, commentIdValue, actorUuidValue = '', options = {}) {
    const momentId = this.requireId(momentIdValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const commentId = this.requireId(commentIdValue, '评论地址无效', 'COMMENT_ID_INVALID');
    const actorUuid = actorUuidValue ? this.requireUuid(actorUuidValue) : '';
    return this.runMutation(async () => {
      const moment = this.moments.get(momentId);
      if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
      const comment = moment.comments.find((item) => item.id === commentId);
      if (!comment) throw new MomentRepositoryError('评论不存在或已被删除', 'COMMENT_NOT_FOUND');
      if (options.isAdmin !== true && comment.ownerUuid !== actorUuid) throw new MomentRepositoryError('只能删除自己的评论', 'COMMENT_FORBIDDEN');
      const now = new Date(this.now()).toISOString();
      const comments = moment.comments
        .filter((item) => item.id !== commentId)
        .map((item) => item.replyToCommentId === commentId ? { ...item, replyToCommentId: '', replyToOwnerUuid: '' } : item);
      this.moments.set(momentId, { ...moment, comments, updatedAt: now });
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.moments.set(momentId, moment);
        throw error;
      }
      return clone(comment);
    });
  }

  requireMoment(idValue) {
    const id = this.requireId(idValue, '心迹地址无效', 'MOMENT_ID_INVALID');
    const moment = this.moments.get(id);
    if (!moment) throw new MomentRepositoryError('这条心迹不存在或已被删除', 'MOMENT_NOT_FOUND');
    return moment;
  }

  normalizeStoredMoment(raw) {
    const media = Array.isArray(raw?.media) ? raw.media.map((item) => this.normalizeStoredAttachment(item, ['image', 'video'])) : [];
    if (media.length > MAX_MEDIA_ITEMS) throw new Error('too many media items');
    const voice = raw?.voice ? { ...this.normalizeStoredAttachment(raw.voice, ['audio']), durationMs: this.normalizeDuration(raw.voice.durationMs) } : null;
    const text = this.optionalText(raw?.text, MAX_TEXT_LENGTH, 'invalid stored text', 'MOMENT_TEXT_INVALID');
    if (!text && media.length === 0 && !voice) throw new Error('empty moment');
    const likedBy = raw?.likedBy == null ? [] : raw.likedBy;
    if (!Array.isArray(likedBy)) throw new Error('invalid stored likes');
    return {
      id: this.requireId(raw?.id, 'invalid stored moment id', 'MOMENT_ID_INVALID'),
      ownerUuid: this.requireUuid(raw?.ownerUuid),
      text,
      media,
      voice,
      location: this.normalizeLocation(raw?.location),
      comments: Array.isArray(raw?.comments) ? raw.comments.map((comment) => this.normalizeStoredComment(comment)) : [],
      likedBy: [...new Set(likedBy.map((uuid) => this.requireUuid(uuid)))],
      createdAt: this.requireDate(raw?.createdAt),
      updatedAt: this.requireDate(raw?.updatedAt || raw?.createdAt)
    };
  }

  normalizeStoredComment(raw) {
    return {
      id: this.requireId(raw?.id, 'invalid stored comment id', 'COMMENT_ID_INVALID'),
      ownerUuid: this.requireUuid(raw?.ownerUuid),
      text: this.requireText(raw?.text, MAX_COMMENT_LENGTH, 'invalid stored comment text', 'COMMENT_TEXT_INVALID'),
      replyToCommentId: raw?.replyToCommentId ? this.requireId(raw.replyToCommentId, 'invalid stored reply id', 'COMMENT_ID_INVALID') : '',
      replyToOwnerUuid: raw?.replyToOwnerUuid ? this.requireUuid(raw.replyToOwnerUuid) : '',
      createdAt: this.requireDate(raw?.createdAt),
      updatedAt: this.requireDate(raw?.updatedAt || raw?.createdAt)
    };
  }

  normalizeStoredAttachment(raw, allowedKinds) {
    const mime = MIME_TYPES.get(String(raw?.mimeType || '').toLowerCase());
    const match = UPLOAD_PATTERN.exec(String(raw?.url || ''));
    if (!mime || !allowedKinds.includes(mime.kind) || raw?.type !== mime.kind || !match) throw new Error('invalid stored attachment');
    return {
      id: this.requireId(raw?.id, 'invalid stored attachment id', 'MOMENT_MEDIA_INVALID'),
      type: mime.kind,
      mimeType: String(raw.mimeType).toLowerCase(),
      url: String(raw.url),
      size: Math.max(0, Number.parseInt(raw.size, 10) || 0),
      name: this.optionalText(raw?.name, 120, 'invalid stored attachment name', 'MOMENT_MEDIA_INVALID')
    };
  }

  async writeAttachment(momentId, raw, allowedKinds) {
    const mimeType = String(raw?.mimeType || '').split(';')[0].trim().toLowerCase();
    const config = MIME_TYPES.get(mimeType);
    if (!config || !allowedKinds.includes(config.kind)) throw new MomentRepositoryError('文件类型不受支持', 'MOMENT_MEDIA_INVALID');
    if (!Buffer.isBuffer(raw?.buffer) || raw.buffer.length === 0) throw new MomentRepositoryError('不能上传空文件', 'MOMENT_MEDIA_INVALID');
    if (raw.buffer.length > config.maxBytes) throw new MomentRepositoryError('上传文件超过大小限制', 'MOMENT_MEDIA_TOO_LARGE');
    const id = randomBytes(12).toString('base64url');
    const suffix = randomBytes(6).toString('base64url');
    const fileName = `${momentId}-${suffix}.${config.extension}`;
    const filePath = path.join(this.uploadDirectory, fileName);
    await fs.promises.mkdir(this.uploadDirectory, { recursive: true });
    await fs.promises.writeFile(filePath, raw.buffer, { flag: 'wx', mode: 0o600 });
    return { id, type: config.kind, mimeType, url: `/uploads/moments/${fileName}`, size: raw.buffer.length, name: this.optionalText(raw.name, 120, '文件名无效', 'MOMENT_MEDIA_INVALID') };
  }

  async deleteMomentAttachments(moment) {
    const urls = [...moment.media.map((item) => item.url), moment.voice?.url].filter(Boolean);
    this.cleanupQueue = Promise.all(urls.map((url) => this.deleteStoredAttachment(url))).then(() => undefined);
    await this.cleanupQueue;
  }

  async deleteStoredAttachment(url) {
    const match = UPLOAD_PATTERN.exec(String(url || ''));
    if (!match) return;
    await fs.promises.unlink(path.join(this.uploadDirectory, match[1])).catch((error) => {
      if (error.code !== 'ENOENT') console.error('Moment attachment could not be deleted:', error.message);
    });
  }

  normalizeLocation(value) {
    if (!value || typeof value !== 'object') return null;
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new MomentRepositoryError('位置信息无效', 'MOMENT_LOCATION_INVALID');
    }
    const label = this.optionalText(value.label, 100, '位置名称无效', 'MOMENT_LOCATION_INVALID') || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)), label };
  }

  normalizeDuration(value) {
    const durationMs = Number.parseInt(value, 10) || 0;
    return Math.max(0, Math.min(30 * 60 * 1000, durationMs));
  }

  createId(collection) {
    let id = '';
    do id = randomBytes(12).toString('base64url');
    while (collection.has(id));
    return id;
  }

  requireUuid(value) {
    const uuid = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw new MomentRepositoryError('浏览器身份无效，请刷新页面重试', 'UUID_INVALID');
    return uuid;
  }

  requireId(value, message, code) {
    const id = String(value || '').trim();
    if (!ID_PATTERN.test(id)) throw new MomentRepositoryError(message, code);
    return id;
  }

  requireText(value, maxLength, message, code) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > maxLength) throw new MomentRepositoryError(message, code);
    return text;
  }

  optionalText(value, maxLength, message, code) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > maxLength) throw new MomentRepositoryError(message, code);
    return text;
  }

  requireDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('invalid date');
    return date.toISOString();
  }
}

const momentRepository = new MomentRepository();

module.exports = {
  MAX_COMMENT_LENGTH,
  MAX_MEDIA_ITEMS,
  MAX_TEXT_LENGTH,
  MIME_TYPES,
  MomentRepository,
  MomentRepositoryError,
  momentRepository
};
