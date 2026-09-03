const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const TOMBSTONE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

class DoodleShareError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DoodleShareError';
    this.code = code;
  }
}

class DoodleShareRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.DOODLE_SHARE_DATA_FILE || path.join(process.cwd(), '.data', 'doodle-shares.json');
    this.uploadDirectory = options.uploadDirectory || process.env.DOODLE_UPLOAD_DIRECTORY || path.join(process.cwd(), 'public', 'uploads', 'doodle');
    this.now = options.now || (() => Date.now());
    this.shares = new Map();
    this.writeQueue = Promise.resolve();
    this.cleanupQueue = Promise.resolve();
    this.lastLoadedMtime = -1;
    this.load(true);
  }

  load(force = false) {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const mtime = fs.statSync(this.dataFile).mtimeMs;
      if (!force && mtime <= this.lastLoadedMtime) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const shares = new Map();
      for (const raw of Array.isArray(data.shares) ? data.shares : []) {
        try {
          const share = this.normalizeStoredShare(raw);
          shares.set(share.id, share);
        } catch {
          // Ignore malformed records so one bad row does not take down all shares.
        }
      }
      this.shares = shares;
      this.lastLoadedMtime = mtime;
      this.cleanupExpired();
    } catch (error) {
      console.error('Doodle shares could not be loaded:', error.message);
    }
  }

  async createShare(input, imageBuffer) {
    this.load();
    const ownerUuid = this.requireUuid(input?.ownerUuid);
    const mimeType = this.requireMimeType(input?.mimeType);
    const title = this.requireTitle(input?.title);
    const style = this.requireStyle(input?.style);
    const template = this.requireTemplate(input?.template || 'comic-cover');
    const reviewKey = input?.reviewKey ? this.requireReviewKey(input.reviewKey) : '';
    const id = this.createId();
    const extension = IMAGE_TYPES.get(mimeType);
    const fileName = `${id}.${extension}`;
    const now = this.now();
    const share = {
      id,
      ownerUuid,
      title,
      style,
      template,
      reviewKey,
      imageUrl: `/uploads/doodle/${fileName}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SHARE_LIFETIME_MS).toISOString(),
      state: 'active',
      removedAt: ''
    };

    await this.writeImage(fileName, imageBuffer);
    this.shares.set(id, share);
    await this.persist();
    return share;
  }

  async updateShare(idValue, ownerUuidValue, input, imageBuffer) {
    this.load();
    const id = this.requireId(idValue);
    const ownerUuid = this.requireUuid(ownerUuidValue);
    const share = this.shares.get(id);
    if (!share) throw new DoodleShareError('没有找到这张涂鸦', 'SHARE_NOT_FOUND');
    if (share.ownerUuid !== ownerUuid) throw new DoodleShareError('只有创建者可以更新这张涂鸦', 'SHARE_FORBIDDEN');
    if (share.state !== 'active' || Date.parse(share.expiresAt) <= this.now()) {
      this.markRemoved(share, 'expired');
      throw new DoodleShareError('这张涂鸦已经过期', 'SHARE_GONE');
    }

    const mimeType = this.requireMimeType(input?.mimeType);
    const extension = IMAGE_TYPES.get(mimeType);
    const previousUrl = share.imageUrl;
    const fileName = `${id}.${extension}`;
    const updated = {
      ...share,
      title: this.requireTitle(input?.title),
      style: this.requireStyle(input?.style),
      template: this.requireTemplate(input?.template || share.template || 'comic-cover'),
      imageUrl: `/uploads/doodle/${fileName}`
    };

    await this.writeImage(fileName, imageBuffer);
    this.shares.set(id, updated);
    if (previousUrl && previousUrl !== updated.imageUrl) this.deleteStoredImage(previousUrl);
    await this.persist();
    return updated;
  }

  getShare(idValue, ownerUuid = '') {
    this.load();
    const id = this.requireId(idValue);
    let share = this.shares.get(id);
    if (!share) return null;
    if (share.state === 'active' && Date.parse(share.expiresAt) <= this.now()) share = this.markRemoved(share, 'expired');
    return { ...this.toPublic(share), isOwner: Boolean(ownerUuid && ownerUuid === share.ownerUuid) };
  }

  listOwnerShares(ownerUuidValue) {
    this.load();
    const ownerUuid = this.requireUuid(ownerUuidValue);
    this.cleanupExpired();
    return [...this.shares.values()]
      .filter((share) => share.ownerUuid === ownerUuid && share.state === 'active')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((share) => this.toPublic(share));
  }

  listAdminShares() {
    this.load();
    this.cleanupExpired();
    return [...this.shares.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((share) => this.toAdmin(share));
  }

  async deleteShare(idValue, ownerUuidValue) {
    this.load();
    const id = this.requireId(idValue);
    const ownerUuid = this.requireUuid(ownerUuidValue);
    const share = this.shares.get(id);
    if (!share) throw new DoodleShareError('没有找到这张涂鸦', 'SHARE_NOT_FOUND');
    if (share.ownerUuid !== ownerUuid) throw new DoodleShareError('只有创建者可以销毁这张涂鸦', 'SHARE_FORBIDDEN');
    const removed = this.markRemoved(share, 'deleted');
    await this.cleanupQueue;
    await this.writeQueue;
    return removed;
  }

  async adminDeleteShare(idValue) {
    this.load();
    const id = this.requireId(idValue);
    const share = this.shares.get(id);
    if (!share) throw new DoodleShareError('没有找到这张涂鸦', 'SHARE_NOT_FOUND');
    const removed = share.state === 'deleted' ? share : this.markRemoved(share, 'deleted');
    await this.cleanupQueue;
    await this.writeQueue;
    return this.toAdmin(removed);
  }

  async adminDeleteByReviewKey(reviewKeyValue) {
    this.load();
    const reviewKey = this.requireReviewKey(reviewKeyValue);
    let count = 0;
    for (const share of this.shares.values()) {
      if (share.reviewKey === reviewKey && share.state === 'active') {
        this.markRemoved(share, 'deleted', false);
        count += 1;
      }
    }
    if (count) await this.persist();
    await this.cleanupQueue;
    await this.writeQueue;
    return count;
  }

  cleanupExpired() {
    const now = this.now();
    let changed = false;
    for (const [id, share] of this.shares) {
      if (share.state === 'active' && Date.parse(share.expiresAt) <= now) {
        this.markRemoved(share, 'expired', false);
        changed = true;
      } else if (share.state !== 'active' && Date.parse(share.removedAt || share.expiresAt) + TOMBSTONE_LIFETIME_MS <= now) {
        this.shares.delete(id);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  markRemoved(share, state, persist = true) {
    const removed = {
      ...share,
      imageUrl: '',
      state,
      removedAt: share.removedAt || new Date(this.now()).toISOString()
    };
    this.shares.set(share.id, removed);
    if (share.imageUrl) this.deleteStoredImage(share.imageUrl);
    if (persist) this.persist();
    return removed;
  }

  toPublic(share) {
    return {
      id: share.id,
      title: share.title,
      style: share.style,
      template: share.template,
      imageUrl: share.state === 'active' ? share.imageUrl : '',
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      state: share.state
    };
  }

  toAdmin(share) {
    return { ...this.toPublic(share), ownerUuid: share.ownerUuid, reviewKey: share.reviewKey };
  }

  normalizeStoredShare(raw) {
    const state = ['active', 'expired', 'deleted'].includes(raw?.state) ? raw.state : 'active';
    return {
      id: this.requireId(raw?.id),
      ownerUuid: this.requireUuid(raw?.ownerUuid),
      title: this.requireTitle(raw?.title),
      style: this.requireStyle(raw?.style),
      template: this.requireTemplate(raw?.template || 'comic-cover'),
      reviewKey: raw?.reviewKey ? this.requireReviewKey(raw.reviewKey) : '',
      imageUrl: state === 'active' && /^\/uploads\/doodle\/[A-Za-z0-9_-]{12}\.(?:jpg|png|webp)$/.test(raw?.imageUrl || '') ? raw.imageUrl : '',
      createdAt: this.requireDate(raw?.createdAt),
      expiresAt: this.requireDate(raw?.expiresAt),
      state,
      removedAt: raw?.removedAt ? this.requireDate(raw.removedAt) : ''
    };
  }

  createId() {
    let id = '';
    do id = randomBytes(9).toString('base64url');
    while (this.shares.has(id));
    return id;
  }

  requireId(value) {
    const id = String(value || '').trim();
    if (!SHARE_ID_PATTERN.test(id)) throw new DoodleShareError('分享地址无效', 'SHARE_ID_INVALID');
    return id;
  }

  requireUuid(value) {
    const uuid = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw new DoodleShareError('浏览器身份无效，请刷新页面重试', 'UUID_INVALID');
    return uuid;
  }

  requireReviewKey(value) {
    const reviewKey = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(reviewKey)) throw new DoodleShareError('审核关联标识无效', 'REVIEW_KEY_INVALID');
    return reviewKey;
  }

  requireMimeType(value) {
    const mimeType = String(value || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(mimeType)) throw new DoodleShareError('仅支持 JPG、PNG 或 WebP 图片', 'IMAGE_TYPE_INVALID');
    return mimeType;
  }

  requireTitle(value) {
    const title = String(value || '').trim();
    if (!title || title.length > 30) throw new DoodleShareError('角色称号需为 1-30 个字符', 'TITLE_INVALID');
    return title;
  }

  requireStyle(value) {
    const style = String(value || '').trim();
    if (!/^[a-z0-9-]{1,24}$/.test(style)) throw new DoodleShareError('涂鸦风格无效', 'STYLE_INVALID');
    return style;
  }

  requireTemplate(value) {
    const template = String(value || '').trim();
    if (!/^[a-z0-9-]{1,24}$/.test(template)) throw new DoodleShareError('卡片模板无效', 'TEMPLATE_INVALID');
    return template;
  }

  requireDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new DoodleShareError('分享时间无效', 'DATE_INVALID');
    return date.toISOString();
  }

  async writeImage(fileName, imageBuffer) {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new DoodleShareError('不能上传空图片', 'IMAGE_EMPTY');
    await fs.promises.mkdir(this.uploadDirectory, { recursive: true });
    const filePath = path.join(this.uploadDirectory, fileName);
    const tempPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
    await fs.promises.writeFile(tempPath, imageBuffer, { flag: 'wx' });
    await fs.promises.rename(tempPath, filePath);
  }

  deleteStoredImage(imageUrl) {
    const match = /^\/uploads\/doodle\/([A-Za-z0-9_-]{12}\.(?:jpg|png|webp))$/.exec(imageUrl || '');
    if (!match) return this.cleanupQueue;
    const filePath = path.join(this.uploadDirectory, match[1]);
    this.cleanupQueue = this.cleanupQueue.then(() => fs.promises.unlink(filePath)).catch((error) => {
      if (error.code !== 'ENOENT') console.error('Doodle image could not be deleted:', error.message);
    });
    return this.cleanupQueue;
  }

  persist() {
    const snapshot = JSON.stringify({ version: 2, shares: [...this.shares.values()] }, null, 2);
    const tempFile = `${this.dataFile}.tmp`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.promises.writeFile(tempFile, snapshot, 'utf8');
        await fs.promises.rename(tempFile, this.dataFile);
        this.lastLoadedMtime = fs.statSync(this.dataFile).mtimeMs;
      })
      .catch((error) => console.error('Doodle shares could not be saved:', error.message));
    return this.writeQueue;
  }
}

const doodleShareRepository = new DoodleShareRepository();

module.exports = {
  DoodleShareError,
  DoodleShareRepository,
  IMAGE_TYPES,
  SHARE_LIFETIME_MS,
  doodleShareRepository
};
