const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const REVIEW_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const TOMBSTONE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

class DoodleReviewError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DoodleReviewError';
    this.code = code;
  }
}

class DoodleReviewRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.DOODLE_REVIEW_DATA_FILE || path.join(process.cwd(), '.data', 'doodle-reviews.json');
    this.uploadDirectory = options.uploadDirectory || process.env.DOODLE_REVIEW_UPLOAD_DIRECTORY || path.join(process.cwd(), '.data', 'doodle-review-images');
    this.now = options.now || (() => Date.now());
    this.reviews = new Map();
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
      const reviews = new Map();
      for (const raw of Array.isArray(data.reviews) ? data.reviews : []) {
        try {
          const review = this.normalizeStoredReview(raw);
          reviews.set(review.id, review);
        } catch {
          // Ignore malformed rows without making the entire moderation list unavailable.
        }
      }
      this.reviews = reviews;
      this.lastLoadedMtime = mtime;
      this.cleanupExpired();
    } catch (error) {
      console.error('Doodle reviews could not be loaded:', error.message);
    }
  }

  async createReview(input, originalBuffer, processedBuffer) {
    this.load();
    const ownerUuid = this.requireUuid(input?.ownerUuid);
    const originalMimeType = this.requireMimeType(input?.originalMimeType);
    const processedMimeType = this.requireMimeType(input?.processedMimeType);
    const id = this.createId();
    const originalFileName = `${id}-original.${IMAGE_TYPES.get(originalMimeType)}`;
    const processedFileName = `${id}-processed.${IMAGE_TYPES.get(processedMimeType)}`;
    const now = this.now();
    const review = {
      id,
      ownerUuid,
      title: this.requireTitle(input?.title),
      style: this.requireToken(input?.style, '涂鸦风格无效', 'STYLE_INVALID'),
      template: this.requireToken(input?.template, '卡片模板无效', 'TEMPLATE_INVALID'),
      shareId: input?.shareId ? this.requireShareId(input.shareId) : '',
      reviewKey: this.requireReviewKey(input?.reviewKey),
      originalFile: originalFileName,
      processedFile: processedFileName,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REVIEW_LIFETIME_MS).toISOString(),
      reviewedAt: '',
      reviewedBy: '',
      removedAt: ''
    };

    await this.writeImage(originalFileName, originalBuffer);
    try {
      await this.writeImage(processedFileName, processedBuffer);
    } catch (error) {
      await fs.promises.unlink(path.join(this.uploadDirectory, originalFileName)).catch(() => undefined);
      throw error;
    }
    this.reviews.set(id, review);
    await this.persist();
    return this.toPublic(review);
  }

  async updateProcessed(idValue, ownerUuidValue, input, processedBuffer) {
    this.load();
    const id = this.requireId(idValue);
    const ownerUuid = this.requireUuid(ownerUuidValue);
    const review = this.reviews.get(id);
    if (!review) throw new DoodleReviewError('没有找到这条审核记录', 'REVIEW_NOT_FOUND');
    if (review.ownerUuid !== ownerUuid) throw new DoodleReviewError('只能更新自己的作品', 'REVIEW_FORBIDDEN');
    if (!['pending', 'approved'].includes(review.status) || Date.parse(review.expiresAt) <= this.now()) {
      if (Date.parse(review.expiresAt) <= this.now()) this.markRemoved(review, 'expired');
      throw new DoodleReviewError('这条审核记录已结束', 'REVIEW_GONE');
    }

    const processedMimeType = this.requireMimeType(input?.processedMimeType);
    const processedFileName = `${id}-processed.${IMAGE_TYPES.get(processedMimeType)}`;
    const previousFile = review.processedFile;
    const updated = {
      ...review,
      title: this.requireTitle(input?.title),
      style: this.requireToken(input?.style, '涂鸦风格无效', 'STYLE_INVALID'),
      template: this.requireToken(input?.template, '卡片模板无效', 'TEMPLATE_INVALID'),
      shareId: input?.shareId ? this.requireShareId(input.shareId) : review.shareId,
      processedFile: processedFileName,
      status: 'pending',
      updatedAt: new Date(this.now()).toISOString(),
      reviewedAt: '',
      reviewedBy: ''
    };
    await this.writeImage(processedFileName, processedBuffer);
    this.reviews.set(id, updated);
    if (previousFile && previousFile !== updated.processedFile) this.deleteStoredImage(previousFile);
    await this.persist();
    return this.toPublic(updated);
  }

  listAdminReviews() {
    this.load();
    this.cleanupExpired();
    return [...this.reviews.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((review) => this.toAdmin(review));
  }

  getAdminImage(idValue, kindValue) {
    this.load();
    const id = this.requireId(idValue);
    const kind = kindValue === 'original' || kindValue === 'processed' ? kindValue : '';
    if (!kind) throw new DoodleReviewError('审核图片类型无效', 'IMAGE_KIND_INVALID');
    const review = this.reviews.get(id);
    if (!review) throw new DoodleReviewError('没有找到这条审核记录', 'REVIEW_NOT_FOUND');
    if (!['pending', 'approved'].includes(review.status)) throw new DoodleReviewError('审核图片已被清理', 'REVIEW_GONE');
    const fileName = kind === 'original' ? review.originalFile : review.processedFile;
    return { filePath: path.join(this.uploadDirectory, fileName), fileName };
  }

  async moderateReview(idValue, action, adminId) {
    this.load();
    const id = this.requireId(idValue);
    const review = this.reviews.get(id);
    if (!review) throw new DoodleReviewError('没有找到这条审核记录', 'REVIEW_NOT_FOUND');
    if (!['approved', 'rejected'].includes(action)) throw new DoodleReviewError('审核操作无效', 'REVIEW_ACTION_INVALID');
    if (!['pending', 'approved'].includes(review.status)) throw new DoodleReviewError('这条审核记录已结束', 'REVIEW_GONE');
    if (action === 'rejected') return this.removeReview(review, 'rejected', adminId);

    const updated = {
      ...review,
      status: 'approved',
      reviewedAt: new Date(this.now()).toISOString(),
      reviewedBy: String(adminId || '').slice(0, 160),
      updatedAt: new Date(this.now()).toISOString()
    };
    this.reviews.set(id, updated);
    await this.persist();
    return this.toAdmin(updated);
  }

  async deleteReview(idValue, adminId) {
    this.load();
    const id = this.requireId(idValue);
    const review = this.reviews.get(id);
    if (!review) throw new DoodleReviewError('没有找到这条审核记录', 'REVIEW_NOT_FOUND');
    const removed = this.markRemoved(review, 'deleted', false, adminId);
    this.reviews.delete(id);
    await this.persist();
    await this.cleanupQueue;
    await this.writeQueue;
    return this.toAdmin(removed);
  }

  async removeReview(review, status, adminId = '') {
    const removed = this.markRemoved(review, status, true, adminId);
    await this.cleanupQueue;
    await this.writeQueue;
    return this.toAdmin(removed);
  }

  cleanupExpired() {
    const now = this.now();
    let changed = false;
    for (const [id, review] of this.reviews) {
      if (['pending', 'approved'].includes(review.status) && Date.parse(review.expiresAt) <= now) {
        this.markRemoved(review, 'expired', false);
        changed = true;
      } else if (!['pending', 'approved'].includes(review.status) && Date.parse(review.removedAt || review.expiresAt) + TOMBSTONE_LIFETIME_MS <= now) {
        this.reviews.delete(id);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  markRemoved(review, status, persist = true, adminId = '') {
    const now = new Date(this.now()).toISOString();
    const removed = {
      ...review,
      originalFile: '',
      processedFile: '',
      status,
      updatedAt: now,
      reviewedAt: adminId ? now : review.reviewedAt,
      reviewedBy: adminId ? String(adminId).slice(0, 160) : review.reviewedBy,
      removedAt: review.removedAt || now
    };
    this.reviews.set(review.id, removed);
    if (review.originalFile) this.deleteStoredImage(review.originalFile);
    if (review.processedFile) this.deleteStoredImage(review.processedFile);
    if (persist) this.persist();
    return removed;
  }

  toPublic(review) {
    return {
      id: review.id,
      status: review.status,
      createdAt: review.createdAt,
      expiresAt: review.expiresAt
    };
  }

  toAdmin(review) {
    return {
      id: review.id,
      ownerUuid: review.ownerUuid,
      title: review.title,
      style: review.style,
      template: review.template,
      shareId: review.shareId,
      reviewKey: review.reviewKey,
      originalUrl: review.originalFile ? `/api/admin/doodles/${review.id}/image/original` : '',
      processedUrl: review.processedFile ? `/api/admin/doodles/${review.id}/image/processed` : '',
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      expiresAt: review.expiresAt,
      reviewedAt: review.reviewedAt,
      reviewedBy: review.reviewedBy
    };
  }

  normalizeStoredReview(raw) {
    const status = ['pending', 'approved', 'rejected', 'deleted', 'expired'].includes(raw?.status) ? raw.status : 'pending';
    const hasImages = ['pending', 'approved'].includes(status);
    return {
      id: this.requireId(raw?.id),
      ownerUuid: this.requireUuid(raw?.ownerUuid),
      title: this.requireTitle(raw?.title),
      style: this.requireToken(raw?.style, '涂鸦风格无效', 'STYLE_INVALID'),
      template: this.requireToken(raw?.template, '卡片模板无效', 'TEMPLATE_INVALID'),
      shareId: raw?.shareId ? this.requireShareId(raw.shareId) : '',
      reviewKey: this.requireReviewKey(raw?.reviewKey),
      originalFile: hasImages ? this.requireImageFile(raw?.originalFile, raw?.id, 'original') : '',
      processedFile: hasImages ? this.requireImageFile(raw?.processedFile, raw?.id, 'processed') : '',
      status,
      createdAt: this.requireDate(raw?.createdAt),
      updatedAt: this.requireDate(raw?.updatedAt || raw?.createdAt),
      expiresAt: this.requireDate(raw?.expiresAt),
      reviewedAt: raw?.reviewedAt ? this.requireDate(raw.reviewedAt) : '',
      reviewedBy: String(raw?.reviewedBy || '').slice(0, 160),
      removedAt: raw?.removedAt ? this.requireDate(raw.removedAt) : ''
    };
  }

  createId() {
    let id = '';
    do id = randomBytes(9).toString('base64url');
    while (this.reviews.has(id));
    return id;
  }

  requireId(value) {
    const id = String(value || '').trim();
    if (!REVIEW_ID_PATTERN.test(id)) throw new DoodleReviewError('审核记录地址无效', 'REVIEW_ID_INVALID');
    return id;
  }

  requireShareId(value) {
    const shareId = String(value || '').trim();
    if (!REVIEW_ID_PATTERN.test(shareId)) throw new DoodleReviewError('分享记录无效', 'SHARE_ID_INVALID');
    return shareId;
  }

  requireReviewKey(value) {
    const reviewKey = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(reviewKey)) throw new DoodleReviewError('审核关联标识无效', 'REVIEW_KEY_INVALID');
    return reviewKey;
  }

  requireUuid(value) {
    const uuid = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw new DoodleReviewError('浏览器身份无效，请刷新页面重试', 'UUID_INVALID');
    return uuid;
  }

  requireMimeType(value) {
    const mimeType = String(value || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(mimeType)) throw new DoodleReviewError('仅支持 JPG、PNG 或 WebP 图片', 'IMAGE_TYPE_INVALID');
    return mimeType;
  }

  requireTitle(value) {
    const title = String(value || '').trim();
    if (!title || title.length > 30) throw new DoodleReviewError('角色称号需为 1-30 个字符', 'TITLE_INVALID');
    return title;
  }

  requireToken(value, message, code) {
    const token = String(value || '').trim();
    if (!/^[a-z0-9-]{1,24}$/.test(token)) throw new DoodleReviewError(message, code);
    return token;
  }

  requireDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new DoodleReviewError('审核时间无效', 'DATE_INVALID');
    return date.toISOString();
  }

  requireImageFile(value, id, kind) {
    const escapedId = String(id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedId}-${kind}\\.(?:jpg|png|webp)$`);
    if (!pattern.test(String(value || ''))) throw new DoodleReviewError('审核图片地址无效', 'IMAGE_URL_INVALID');
    return value;
  }

  async writeImage(fileName, imageBuffer) {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new DoodleReviewError('不能上传空图片', 'IMAGE_EMPTY');
    await fs.promises.mkdir(this.uploadDirectory, { recursive: true });
    const filePath = path.join(this.uploadDirectory, fileName);
    const tempPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
    await fs.promises.writeFile(tempPath, imageBuffer, { flag: 'wx' });
    await fs.promises.rename(tempPath, filePath);
  }

  deleteStoredImage(fileName) {
    const match = /^([A-Za-z0-9_-]{12}-(?:original|processed)\.(?:jpg|png|webp))$/.exec(fileName || '');
    if (!match) return this.cleanupQueue;
    const filePath = path.join(this.uploadDirectory, match[1]);
    this.cleanupQueue = this.cleanupQueue.then(() => fs.promises.unlink(filePath)).catch((error) => {
      if (error.code !== 'ENOENT') console.error('Doodle review image could not be deleted:', error.message);
    });
    return this.cleanupQueue;
  }

  persist() {
    const snapshot = JSON.stringify({ version: 1, reviews: [...this.reviews.values()] }, null, 2);
    const tempFile = `${this.dataFile}.tmp`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.promises.writeFile(tempFile, snapshot, 'utf8');
        await fs.promises.rename(tempFile, this.dataFile);
        this.lastLoadedMtime = fs.statSync(this.dataFile).mtimeMs;
      })
      .catch((error) => console.error('Doodle reviews could not be saved:', error.message));
    return this.writeQueue;
  }
}

const doodleReviewRepository = new DoodleReviewRepository();

module.exports = {
  DoodleReviewError,
  DoodleReviewRepository,
  REVIEW_LIFETIME_MS,
  doodleReviewRepository
};
