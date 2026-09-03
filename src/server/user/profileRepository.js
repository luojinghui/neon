const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const USER_ID_PATTERN = /^[A-Za-z0-9]{3,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_MEDIA_PATTERN = /^\/uploads\/profile\/[a-f0-9-]+\.(?:png|jpg|webp|gif)$/;
const BANNER_PRESETS = new Set(['sunrise', 'coral', 'aurora', 'lagoon', 'violet', 'midnight']);

class ProfileRepositoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ProfileRepositoryError';
    this.code = code;
  }
}

function createPublicKey(uuid) {
  return createHash('sha256').update(`neon-profile:${uuid}`).digest('base64url').slice(0, 18);
}

const SYSTEM_PROFILES = [
  {
    uuid: '',
    publicKey: 'planetguide',
    userId: 'planetguide',
    name: '星球向导',
    bio: '在每一颗新星球旁边，留下一盏欢迎你的灯。',
    avatarUrl: '',
    banner: { type: 'preset', value: 'midnight' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSystem: true
  }
];

class ProfileRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.USER_PROFILE_DATA_FILE || path.join(process.cwd(), '.data', 'user-profiles.json');
    this.profiles = new Map();
    this.userIds = new Map();
    this.publicKeys = new Map();
    this.writeQueue = Promise.resolve();
    this.lastLoadedMtime = -1;
    this.load(true);
  }

  load(force = false) {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const mtime = fs.statSync(this.dataFile).mtimeMs;
      if (!force && mtime <= this.lastLoadedMtime) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const profiles = new Map();
      const userIds = new Map();
      const publicKeys = new Map();
      for (const raw of Array.isArray(data.profiles) ? data.profiles : []) {
        try {
          const profile = this.normalizeStoredProfile(raw);
          if (profiles.has(profile.uuid) || userIds.has(profile.userId.toLowerCase())) continue;
          profiles.set(profile.uuid, profile);
          userIds.set(profile.userId.toLowerCase(), profile.uuid);
          publicKeys.set(profile.publicKey, profile.uuid);
        } catch {
          // Ignore malformed legacy records instead of making every profile unavailable.
        }
      }
      this.profiles = profiles;
      this.userIds = userIds;
      this.publicKeys = publicKeys;
      this.lastLoadedMtime = mtime;
    } catch (error) {
      console.error('User profiles could not be loaded:', error.message);
    }
  }

  getByUuid(uuid) {
    this.load();
    return this.profiles.get(String(uuid || '')) || null;
  }

  getByUserId(userId) {
    this.load();
    const normalized = String(userId || '').trim().toLowerCase();
    const systemProfile = SYSTEM_PROFILES.find((profile) => profile.userId.toLowerCase() === normalized);
    if (systemProfile) return systemProfile;
    const uuid = this.userIds.get(normalized);
    return uuid ? this.profiles.get(uuid) || null : null;
  }

  getByPublicKey(publicKey) {
    this.load();
    const normalized = String(publicKey || '').trim();
    const systemProfile = SYSTEM_PROFILES.find((profile) => profile.publicKey === normalized);
    if (systemProfile) return systemProfile;
    const uuid = this.publicKeys.get(normalized);
    return uuid ? this.profiles.get(uuid) || null : null;
  }

  ensureProfile(input) {
    this.load();
    const uuid = this.requireUuid(input?.uuid);
    const existing = this.profiles.get(uuid);
    if (existing) return existing;

    const requestedUserId = this.optionalUserId(input?.userId);
    const userId = requestedUserId && this.isUserIdAvailable(requestedUserId) ? requestedUserId : this.generateUserId(uuid);
    const suffix = userId.slice(-4).toUpperCase();
    const now = new Date().toISOString();
    const profile = {
      uuid,
      publicKey: createPublicKey(uuid),
      userId,
      name: this.optionalText(input?.name, 32) || `星球旅人 ${suffix}`,
      bio: '',
      avatarUrl: '',
      banner: { type: 'preset', value: 'sunrise' },
      createdAt: now,
      updatedAt: now,
      isSystem: false
    };
    this.profiles.set(uuid, profile);
    this.userIds.set(userId.toLowerCase(), uuid);
    this.publicKeys.set(profile.publicKey, uuid);
    this.persist();
    return profile;
  }

  updateProfile(uuidValue, input) {
    this.load();
    const uuid = this.requireUuid(uuidValue);
    const profile = this.profiles.get(uuid);
    if (!profile) throw new ProfileRepositoryError('个人资料不存在', 'PROFILE_NOT_FOUND');

    const userId = this.requireUserId(input?.userId);
    const owner = this.userIds.get(userId.toLowerCase());
    if (owner && owner !== uuid) throw new ProfileRepositoryError('这个 userId 已经被使用', 'USER_ID_TAKEN');

    const updated = {
      ...profile,
      userId,
      name: this.requireText(input?.name, '个人名称', 32),
      bio: this.optionalText(input?.bio, 160),
      avatarUrl: this.normalizeAvatar(input?.avatarUrl),
      banner: this.normalizeBanner(input?.banner),
      updatedAt: new Date().toISOString()
    };
    if (profile.userId.toLowerCase() !== userId.toLowerCase()) this.userIds.delete(profile.userId.toLowerCase());
    this.userIds.set(userId.toLowerCase(), uuid);
    this.profiles.set(uuid, updated);
    this.persist();
    return updated;
  }

  toPublic(profile) {
    if (!profile) return null;
    const { uuid: _uuid, ...publicProfile } = profile;
    return publicProfile;
  }

  isUserIdAvailable(userId) {
    const normalized = String(userId || '').toLowerCase();
    return !this.userIds.has(normalized) && !SYSTEM_PROFILES.some((profile) => profile.userId.toLowerCase() === normalized);
  }

  generateUserId(uuid) {
    const compact = uuid.replace(/-/g, '').toUpperCase();
    for (let length = 8; length <= 16; length += 2) {
      const candidate = `Soul${compact.slice(0, length)}`;
      if (this.isUserIdAvailable(candidate)) return candidate;
    }
    throw new ProfileRepositoryError('暂时无法生成 userId，请重试', 'USER_ID_GENERATION_FAILED');
  }

  normalizeStoredProfile(raw) {
    const uuid = this.requireUuid(raw?.uuid);
    const userId = this.requireUserId(raw?.userId);
    return {
      uuid,
      publicKey: createPublicKey(uuid),
      userId,
      name: this.requireText(raw?.name, '个人名称', 32),
      bio: this.optionalText(raw?.bio, 160),
      avatarUrl: this.normalizeAvatar(raw?.avatarUrl),
      banner: this.normalizeBanner(raw?.banner),
      createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      isSystem: false
    };
  }

  normalizeAvatar(value) {
    const avatarUrl = this.optionalText(value, 300);
    if (avatarUrl && !PROFILE_MEDIA_PATTERN.test(avatarUrl)) throw new ProfileRepositoryError('头像地址不合法', 'PROFILE_MEDIA_INVALID');
    return avatarUrl;
  }

  normalizeBanner(value) {
    if (!value || typeof value !== 'object') return { type: 'preset', value: 'sunrise' };
    if (value.type === 'preset' && BANNER_PRESETS.has(value.value)) return { type: 'preset', value: value.value };
    if (value.type === 'image' && PROFILE_MEDIA_PATTERN.test(value.value || '')) return { type: 'image', value: value.value };
    throw new ProfileRepositoryError('背景设置不合法', 'PROFILE_MEDIA_INVALID');
  }

  requireUuid(value) {
    const uuid = String(value || '').trim();
    if (!UUID_PATTERN.test(uuid)) throw new ProfileRepositoryError('浏览器身份无效，请刷新页面重试', 'UUID_INVALID');
    return uuid.toLowerCase();
  }

  requireUserId(value) {
    const userId = String(value || '').trim();
    if (!USER_ID_PATTERN.test(userId)) throw new ProfileRepositoryError('userId 需为 3-20 位数字或字母', 'USER_ID_INVALID');
    return userId;
  }

  optionalUserId(value) {
    const userId = String(value || '').trim();
    return USER_ID_PATTERN.test(userId) ? userId : '';
  }

  requireText(value, fieldName, maxLength) {
    const text = this.optionalText(value, maxLength + 1);
    if (!text) throw new ProfileRepositoryError(`${fieldName}不能为空`, 'PROFILE_INVALID');
    if (text.length > maxLength) throw new ProfileRepositoryError(`${fieldName}不能超过 ${maxLength} 个字符`, 'PROFILE_INVALID');
    return text;
  }

  optionalText(value, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.slice(0, maxLength);
  }

  persist() {
    const snapshot = JSON.stringify({ profiles: [...this.profiles.values()] }, null, 2);
    const tempFile = `${this.dataFile}.tmp`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.promises.writeFile(tempFile, snapshot, 'utf8');
        await fs.promises.rename(tempFile, this.dataFile);
        this.lastLoadedMtime = fs.statSync(this.dataFile).mtimeMs;
      })
      .catch((error) => console.error('User profiles could not be saved:', error.message));
    return this.writeQueue;
  }
}

const profileRepository = new ProfileRepository();

module.exports = {
  BANNER_PRESETS,
  ProfileRepository,
  ProfileRepositoryError,
  USER_ID_PATTERN,
  createPublicKey,
  profileRepository
};
