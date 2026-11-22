const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { runFileExclusive, writeFileAtomic } = require('../storage/filePersistence');
const { profileRepository } = require('../user/profileRepository');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const PASSCODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DEFAULT_PASSCODE_LENGTH = 5;
const PASSCODE_PATTERN = /^[A-Z0-9]{4,6}$/;
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ISLAND_NAME_LENGTH = 32;
const MAX_ITEMS_PER_ISLAND = 300;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const NOTE_COLORS = new Set(['sun', 'sky', 'blush', 'mint', 'lavender']);
const ITEM_TYPES = new Set(['note', 'polaroid', 'sticker', 'tape']);

const IMAGE_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

class IslandRepositoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'IslandRepositoryError';
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeText(value, maxLength) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, maxLength);
}

class IslandRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.ISLAND_DATA_FILE || path.join(process.cwd(), '.data', 'islands.json');
    this.uploadDirectory = options.uploadDirectory || process.env.ISLAND_UPLOAD_DIRECTORY || path.join(process.cwd(), '.data', 'uploads', 'islands');
    this.now = options.now || (() => Date.now());
    this.resolveProfile = options.resolveProfile || (({ uuid, publicKey, userId }) => {
      if (uuid) return profileRepository.getByUuid(uuid);
      if (publicKey) return profileRepository.getByPublicKey(publicKey);
      if (userId) return profileRepository.getByUserId(userId);
      return null;
    });
    this.islands = new Map();
    this.writeQueue = Promise.resolve();
    this.lastLoadedMtime = -1;
    this.loadError = null;
    this.load(true);
  }

  load(force = false) {
    try {
      if (!fs.existsSync(this.dataFile)) {
        if (force) {
          this.islands = new Map();
          this.lastLoadedMtime = -1;
        }
        this.loadError = null;
        return;
      }
      const mtime = fs.statSync(this.dataFile).mtimeMs;
      if (!force && mtime <= this.lastLoadedMtime) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      if (!data || !Array.isArray(data.islands)) throw new Error('islands must be an array');
      const islands = new Map();
      for (const raw of data.islands) {
        const island = this.normalizeStoredIsland(raw);
        if (islands.has(island.id)) throw new Error(`duplicate island ${island.id}`);
        islands.set(island.id, island);
      }
      this.islands = islands;
      this.lastLoadedMtime = mtime;
      this.loadError = null;
    } catch (error) {
      this.loadError = error;
      console.error('Islands could not be loaded:', error.message);
    }
  }

  ensureLoaded(force = false) {
    this.load(force);
    if (this.loadError) {
      throw new IslandRepositoryError('浮岛数据暂时无法读取，请稍后重试', 'ISLAND_STORAGE_UNAVAILABLE');
    }
  }

  runMutation(task) {
    const operation = runFileExclusive(this.dataFile, async () => {
      this.ensureLoaded(true);
      return task();
    }).catch((error) => {
      if (error instanceof IslandRepositoryError) throw error;
      console.error('Island storage operation failed:', error.message);
      throw new IslandRepositoryError('浮岛数据保存失败，请稍后重试', 'ISLAND_STORAGE_UNAVAILABLE');
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async persistUnlocked() {
    await writeFileAtomic(
      this.dataFile,
      JSON.stringify({ version: 1, islands: [...this.islands.values()] }, null, 2)
    );
    this.lastLoadedMtime = fs.statSync(this.dataFile).mtimeMs;
  }

  generatePasscode(length = DEFAULT_PASSCODE_LENGTH) {
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += PASSCODE_ALPHABET[bytes[i] % PASSCODE_ALPHABET.length];
    }
    return result;
  }

  generateInviteToken() {
    const used = new Set([...this.islands.values()].map((item) => item.inviteToken));
    let token = '';
    do {
      token = randomBytes(12).toString('base64url');
    } while (used.has(token));
    return token;
  }

  createId(existingSet) {
    let id = '';
    do {
      id = randomBytes(12).toString('base64url');
    } while (existingSet.has(id));
    return id;
  }

  normalizePasscode(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!PASSCODE_PATTERN.test(normalized)) {
      throw new IslandRepositoryError('登岛密码需为 4-6 位字母或数字', 'ISLAND_PASSCODE_INVALID');
    }
    return normalized;
  }

  isInviteExpired(island) {
    const ts = Date.parse(island?.inviteExpiresAt || '');
    return Number.isNaN(ts) || ts <= this.now();
  }

  requireProfile(profile) {
    const publicKey = String(profile?.publicKey || '').trim();
    const uuid = String(profile?.uuid || '').trim().toLowerCase();
    if (!publicKey || (uuid && !UUID_PATTERN.test(uuid))) {
      throw new IslandRepositoryError('个人资料无效，请刷新页面重试', 'PROFILE_NOT_FOUND');
    }
    return {
      uuid,
      publicKey,
      userId: String(profile?.userId || '').trim(),
      name: sanitizeText(profile?.name || '浮岛旅人', 32).trim() || '浮岛旅人',
      avatarUrl: String(profile?.avatarUrl || '').trim()
    };
  }

  findOwnedIslandUnlocked(publicKey, uuid = '') {
    for (const island of this.islands.values()) {
      if (island.ownerPublicKey === publicKey || (uuid && island.ownerUuid === uuid)) {
        return island;
      }
    }
    return null;
  }

  async ensurePersonalIsland(rawProfile) {
    const profile = this.requireProfile(rawProfile);
    this.ensureLoaded();
    const cached = this.findOwnedIslandUnlocked(profile.publicKey, profile.uuid);
    if (cached) return clone(cached);

    return this.runMutation(async () => {
      const existing = this.findOwnedIslandUnlocked(profile.publicKey, profile.uuid);
      if (existing) return clone(existing);

      const nowMs = this.now();
      const nowIso = new Date(nowMs).toISOString();
      const defaultName = `${profile.name.slice(0, 24)} 的浮岛`.slice(0, MAX_ISLAND_NAME_LENGTH);
      const island = {
        id: this.createId(this.islands),
        ownerUuid: profile.uuid,
        ownerPublicKey: profile.publicKey,
        ownerUserId: profile.userId,
        ownerName: profile.name,
        ownerAvatarUrl: profile.avatarUrl,
        name: defaultName,
        passcode: this.generatePasscode(),
        inviteToken: this.generateInviteToken(),
        inviteExpiresAt: new Date(nowMs + INVITE_TTL_MS).toISOString(),
        allowVisitorEdit: true,
        members: {},
        items: [],
        createdAt: nowIso,
        updatedAt: nowIso
      };
      this.islands.set(island.id, island);
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.delete(island.id);
        throw error;
      }
      return clone(island);
    });
  }

  getIslandById(islandId) {
    this.ensureLoaded();
    const id = String(islandId || '').trim();
    if (!id) return null;
    const island = this.islands.get(id);
    return island ? clone(island) : null;
  }

  getIslandByOwnerPublicKey(publicKey) {
    this.ensureLoaded();
    const key = String(publicKey || '').trim();
    if (!key) return null;
    const island = this.findOwnedIslandUnlocked(key);
    return island ? clone(island) : null;
  }

  getIslandByInviteToken(inviteToken) {
    this.ensureLoaded();
    const token = String(inviteToken || '').trim();
    if (!token) return null;
    for (const island of this.islands.values()) {
      if (island.inviteToken === token) return clone(island);
    }
    return null;
  }

  listJoinedIslands(publicKey) {
    this.ensureLoaded();
    const key = String(publicKey || '').trim();
    if (!key) return [];
    return [...this.islands.values()]
      .filter((island) => island.ownerPublicKey !== key && Boolean(island.members[key]))
      .sort((a, b) => {
        const aTime = Date.parse(a.members[key]?.lastVisitedAt || a.updatedAt) || 0;
        const bTime = Date.parse(b.members[key]?.lastVisitedAt || b.updatedAt) || 0;
        return bTime - aTime || b.id.localeCompare(a.id);
      })
      .map(clone);
  }

  listAllIslands() {
    this.ensureLoaded();
    return [...this.islands.values()]
      .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || b.id.localeCompare(a.id))
      .map(clone);
  }

  canAccessIsland(island, profile, options = {}) {
    if (!island) return false;
    if (options.isAdmin === true) return true;
    const publicKey = String(profile?.publicKey || '').trim();
    if (!publicKey) return false;
    return island.ownerPublicKey === publicKey || Boolean(island.members?.[publicKey]);
  }

  canEditIsland(island, profile) {
    if (!island) return false;
    const publicKey = String(profile?.publicKey || '').trim();
    if (!publicKey) return false;
    return island.ownerPublicKey === publicKey || Boolean(island.members?.[publicKey]);
  }

  canMutateItem(island, item, profile, options = {}) {
    if (!island || !item) return false;
    if (options.isAdmin === true) return true;
    const publicKey = String(profile?.publicKey || '').trim();
    if (!publicKey) return false;
    if (island.ownerPublicKey === publicKey) return true;
    return Boolean(island.members?.[publicKey]) && item.authorPublicKey === publicKey;
  }

  canArrangeItem(island, profile, options = {}) {
    if (!island) return false;
    if (options.isAdmin === true) return true;
    const publicKey = String(profile?.publicKey || '').trim();
    if (!publicKey) return false;
    return island.ownerPublicKey === publicKey || Boolean(island.members?.[publicKey]);
  }

  previewInvite(inviteToken, viewerProfile = null) {
    this.ensureLoaded();
    const token = String(inviteToken || '').trim();
    if (!token) throw new IslandRepositoryError('请提供有效的邀请链接', 'ISLAND_INVITE_INVALID');
    let target = null;
    for (const island of this.islands.values()) {
      if (island.inviteToken === token) {
        target = island;
        break;
      }
    }
    if (!target) throw new IslandRepositoryError('邀请链接无效或已失效', 'ISLAND_INVITE_INVALID');
    const publicKey = String(viewerProfile?.publicKey || '').trim();
    const isOwner = Boolean(publicKey && target.ownerPublicKey === publicKey);
    const alreadyJoined = Boolean(publicKey && (isOwner || target.members[publicKey]));
    return {
      inviteToken: target.inviteToken,
      ...(alreadyJoined ? { islandId: target.id } : {}),
      islandName: target.name,
      owner: this.presentPerson(target.ownerPublicKey, {
        uuid: target.ownerUuid,
        userId: target.ownerUserId,
        name: target.ownerName,
        avatarUrl: target.ownerAvatarUrl
      }),
      expired: this.isInviteExpired(target),
      inviteExpiresAt: target.inviteExpiresAt,
      alreadyJoined,
      isOwner
    };
  }

  async joinByInvite(inviteToken, rawProfile) {
    const profile = this.requireProfile(rawProfile);
    const token = String(inviteToken || '').trim();
    if (!token) throw new IslandRepositoryError('请提供有效的邀请链接', 'ISLAND_INVITE_INVALID');

    return this.runMutation(async () => {
      let target = null;
      for (const island of this.islands.values()) {
        if (island.inviteToken === token) {
          target = island;
          break;
        }
      }
      if (!target) throw new IslandRepositoryError('邀请链接无效或已失效', 'ISLAND_INVITE_INVALID');

      if (target.ownerPublicKey === profile.publicKey) {
        return clone(target);
      }

      const nowIso = new Date(this.now()).toISOString();
      const existingMember = target.members[profile.publicKey];
      if (existingMember) {
        target.members[profile.publicKey] = {
          ...existingMember,
          uuid: profile.uuid || existingMember.uuid,
          userId: profile.userId || existingMember.userId,
          name: profile.name || existingMember.name,
          avatarUrl: profile.avatarUrl || existingMember.avatarUrl,
          lastVisitedAt: nowIso
        };
        await this.persistUnlocked();
        return clone(target);
      }

      if (this.isInviteExpired(target)) {
        throw new IslandRepositoryError('邀请链接已过期，请联系岛主获取新链接', 'ISLAND_INVITE_EXPIRED');
      }

      const previousMembers = { ...target.members };
      const previousUpdatedAt = target.updatedAt;
      target.members[profile.publicKey] = {
        publicKey: profile.publicKey,
        uuid: profile.uuid,
        userId: profile.userId,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        joinedAt: nowIso,
        lastVisitedAt: nowIso
      };
      target.updatedAt = nowIso;
      try {
        await this.persistUnlocked();
      } catch (error) {
        target.members = previousMembers;
        target.updatedAt = previousUpdatedAt;
        throw error;
      }
      return clone(target);
    });
  }

  async touchVisit(islandId, rawProfile) {
    const publicKey = String(rawProfile?.publicKey || '').trim();
    if (!islandId || !publicKey) return;
    return this.runMutation(async () => {
      const island = this.islands.get(String(islandId).trim());
      if (!island || !island.members[publicKey]) return;
      island.members[publicKey] = {
        ...island.members[publicKey],
        userId: rawProfile.userId || island.members[publicKey].userId,
        name: rawProfile.name || island.members[publicKey].name,
        avatarUrl: rawProfile.avatarUrl ?? island.members[publicKey].avatarUrl,
        lastVisitedAt: new Date(this.now()).toISOString()
      };
      await this.persistUnlocked();
    });
  }

  async updateSettings(islandId, rawProfile, patch = {}) {
    const profile = this.requireProfile(rawProfile);
    const id = String(islandId || '').trim();
    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      if (island.ownerPublicKey !== profile.publicKey) {
        throw new IslandRepositoryError('只有岛主可以修改浮岛设置', 'ISLAND_FORBIDDEN');
      }

      const snapshot = clone(island);
      const nowMs = this.now();
      const nowIso = new Date(nowMs).toISOString();

      if (typeof patch.name === 'string') {
        const name = sanitizeText(patch.name, MAX_ISLAND_NAME_LENGTH).trim();
        if (!name) throw new IslandRepositoryError('浮岛名称不能为空', 'ISLAND_NAME_INVALID');
        island.name = name;
      }

      if (patch.regenerateInvite === true) {
        island.inviteToken = this.generateInviteToken();
        island.inviteExpiresAt = new Date(nowMs + INVITE_TTL_MS).toISOString();
      }

      if (typeof patch.removeMemberPublicKey === 'string' && patch.removeMemberPublicKey.trim()) {
        const removeKey = patch.removeMemberPublicKey.trim();
        delete island.members[removeKey];
      }

      island.updatedAt = nowIso;
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return clone(island);
    });
  }

  async leaveIsland(islandId, rawProfile) {
    const profile = this.requireProfile(rawProfile);
    const id = String(islandId || '').trim();
    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      if (island.ownerPublicKey === profile.publicKey) {
        throw new IslandRepositoryError('不能退出自己的浮岛', 'ISLAND_OWNER_CANNOT_LEAVE');
      }
      if (!island.members[profile.publicKey]) return { ok: true, removed: false };
      const snapshot = clone(island);
      delete island.members[profile.publicKey];
      island.updatedAt = new Date(this.now()).toISOString();
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return { ok: true, removed: true };
    });
  }

  async removeMemberAsAdmin(islandId, publicKey) {
    const id = String(islandId || '').trim();
    const key = String(publicKey || '').trim();
    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      const removedMember = island.members[key];
      if (!removedMember) throw new IslandRepositoryError('该访客不在此浮岛中', 'ISLAND_MEMBER_NOT_FOUND');
      const snapshot = clone(island);
      delete island.members[key];
      island.updatedAt = new Date(this.now()).toISOString();
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return { island: clone(island), removedMember: clone(removedMember) };
    });
  }

  normalizeItemData(type, rawData) {
    const data = rawData && typeof rawData === 'object' ? rawData : {};
    if (type === 'note') {
      const color = NOTE_COLORS.has(data.color) ? data.color : 'sun';
      return {
        text: sanitizeText(data.text, 1000),
        color
      };
    }
    if (type === 'polaroid') {
      const imageUrl = String(data.imageUrl || '').trim().slice(0, 300);
      if (imageUrl && !imageUrl.startsWith('/uploads/islands/')) {
        throw new IslandRepositoryError('拍立得图片地址无效', 'ISLAND_ITEM_INVALID');
      }
      return {
        imageUrl,
        caption: sanitizeText(data.caption, 200),
        dateLabel: sanitizeText(data.dateLabel, 40)
      };
    }
    if (type === 'sticker' || type === 'tape') {
      const presetId = sanitizeText(data.presetId, 64).trim();
      if (!presetId) throw new IslandRepositoryError('装饰素材标识无效', 'ISLAND_ITEM_INVALID');
      return { presetId };
    }
    throw new IslandRepositoryError('不支持的物件类型', 'ISLAND_ITEM_INVALID');
  }

  async upsertItem(islandId, rawProfile, rawItem) {
    const profile = this.requireProfile(rawProfile);
    const id = String(islandId || '').trim();
    if (!rawItem || typeof rawItem !== 'object') {
      throw new IslandRepositoryError('物件数据无效', 'ISLAND_ITEM_INVALID');
    }

    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      if (!this.canAccessIsland(island, profile)) {
        throw new IslandRepositoryError('没有访问该浮岛的权限', 'ISLAND_FORBIDDEN');
      }
      const isOwner = island.ownerPublicKey === profile.publicKey;

      const type = String(rawItem.type || '').trim();
      if (!ITEM_TYPES.has(type)) {
        throw new IslandRepositoryError('不支持的物件类型', 'ISLAND_ITEM_INVALID');
      }

      const requestedId = typeof rawItem.id === 'string' ? rawItem.id.trim() : '';
      const existingIndex = requestedId ? island.items.findIndex((item) => item.id === requestedId) : -1;
      const existing = existingIndex >= 0 ? island.items[existingIndex] : null;
      const nowIso = new Date(this.now()).toISOString();

      if (existing) {
        if (!isOwner && existing.authorPublicKey !== profile.publicKey) {
          throw new IslandRepositoryError('只能编辑自己放置的物件', 'ISLAND_ITEM_FORBIDDEN');
        }
      } else if (island.items.length >= MAX_ITEMS_PER_ISLAND) {
        throw new IslandRepositoryError(`每座浮岛最多放置 ${MAX_ITEMS_PER_ISLAND} 个物件`, 'ISLAND_ITEM_LIMIT');
      }

      const existingIds = new Set(island.items.map((item) => item.id));
      const itemId = existing
        ? existing.id
        : requestedId && ID_PATTERN.test(requestedId) && !existingIds.has(requestedId)
          ? requestedId
          : this.createId(existingIds);

      const maxZ = island.items.reduce((acc, item) => Math.max(acc, item.zIndex || 0), 0);
      const normalizedItem = {
        id: itemId,
        type,
        x: clampNumber(rawItem.x, -50000, 50000, existing?.x ?? 0),
        y: clampNumber(rawItem.y, -50000, 50000, existing?.y ?? 0),
        w: clampNumber(rawItem.w, 16, 2000, existing?.w ?? 200),
        h: clampNumber(rawItem.h, 16, 2000, existing?.h ?? 200),
        rotation: clampNumber(rawItem.rotation, -360, 360, existing?.rotation ?? 0),
        zIndex: Math.round(clampNumber(rawItem.zIndex, 0, 1000000, existing?.zIndex ?? maxZ + 1)),
        authorPublicKey: existing ? existing.authorPublicKey : profile.publicKey,
        authorName: existing ? existing.authorName : profile.name,
        data: this.normalizeItemData(type, rawItem.data),
        createdAt: existing ? existing.createdAt : nowIso,
        updatedAt: nowIso
      };

      const snapshot = clone(island);
      if (existingIndex >= 0) {
        island.items[existingIndex] = normalizedItem;
      } else {
        island.items.push(normalizedItem);
      }
      island.updatedAt = nowIso;

      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return this.presentItem(normalizedItem);
    });
  }

  async moveItem(islandId, rawProfile, payload = {}, options = {}) {
    const profile = options.isAdmin === true ? null : this.requireProfile(rawProfile);
    const id = String(islandId || '').trim();
    const itemId = String(payload.itemId || '').trim();
    if (!itemId) throw new IslandRepositoryError('物件标识无效', 'ISLAND_ITEM_INVALID');

    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      const index = island.items.findIndex((item) => item.id === itemId);
      if (index < 0) throw new IslandRepositoryError('物件不存在或已被删除', 'ISLAND_ITEM_NOT_FOUND');
      const item = island.items[index];
      if (!this.canArrangeItem(island, profile, options)) {
        throw new IslandRepositoryError('没有操作该浮岛物件的权限', 'ISLAND_ITEM_FORBIDDEN');
      }

      const snapshot = clone(island);
      const nowIso = new Date(this.now()).toISOString();
      const updated = {
        ...item,
        x: clampNumber(payload.x, -50000, 50000, item.x),
        y: clampNumber(payload.y, -50000, 50000, item.y),
        ...(payload.w !== undefined ? { w: clampNumber(payload.w, 16, 2000, item.w) } : {}),
        ...(payload.h !== undefined ? { h: clampNumber(payload.h, 16, 2000, item.h) } : {}),
        ...(payload.rotation !== undefined ? { rotation: clampNumber(payload.rotation, -360, 360, item.rotation) } : {}),
        ...(payload.zIndex !== undefined ? { zIndex: Math.round(clampNumber(payload.zIndex, 0, 1000000, item.zIndex)) } : {}),
        updatedAt: nowIso
      };
      island.items[index] = updated;
      island.updatedAt = nowIso;
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return this.presentItem(updated);
    });
  }

  async deleteItem(islandId, rawProfile, itemIdValue, options = {}) {
    const id = String(islandId || '').trim();
    const itemId = String(itemIdValue || '').trim();
    const profile = options.isAdmin === true ? null : this.requireProfile(rawProfile);

    return this.runMutation(async () => {
      const island = this.islands.get(id);
      if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      const index = island.items.findIndex((item) => item.id === itemId);
      if (index < 0) throw new IslandRepositoryError('物件不存在或已被删除', 'ISLAND_ITEM_NOT_FOUND');
      const item = island.items[index];

      if (options.isAdmin !== true && !this.canMutateItem(island, item, profile)) {
        throw new IslandRepositoryError('只能删除自己放置的物件', 'ISLAND_ITEM_FORBIDDEN');
      }

      const snapshot = clone(island);
      island.items.splice(index, 1);
      island.updatedAt = new Date(this.now()).toISOString();
      try {
        await this.persistUnlocked();
      } catch (error) {
        this.islands.set(id, snapshot);
        throw error;
      }
      return clone(item);
    });
  }

  async saveMedia(islandId, rawProfile, fileInput) {
    const profile = this.requireProfile(rawProfile);
    this.ensureLoaded();
    const island = this.islands.get(String(islandId || '').trim());
    if (!island) throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
    if (!this.canEditIsland(island, profile)) {
      throw new IslandRepositoryError('没有上传图片到该浮岛的权限', 'ISLAND_EDIT_FORBIDDEN');
    }

    const mimeType = String(fileInput?.mimeType || '').split(';')[0].trim().toLowerCase();
    const extension = IMAGE_MIME_TYPES.get(mimeType);
    if (!extension) {
      throw new IslandRepositoryError('仅支持 PNG、JPG、WebP、GIF 格式图片', 'ISLAND_MEDIA_INVALID');
    }
    if (!Buffer.isBuffer(fileInput?.buffer) || fileInput.buffer.length === 0) {
      throw new IslandRepositoryError('不能上传空图片', 'ISLAND_MEDIA_INVALID');
    }
    if (fileInput.buffer.length > MAX_IMAGE_BYTES) {
      throw new IslandRepositoryError('图片大小不能超过 8 MB', 'ISLAND_MEDIA_TOO_LARGE');
    }

    const suffix = randomBytes(8).toString('base64url');
    const fileName = `${island.id}-${suffix}.${extension}`;
    const filePath = path.join(this.uploadDirectory, fileName);
    await fs.promises.mkdir(this.uploadDirectory, { recursive: true });
    await fs.promises.writeFile(filePath, fileInput.buffer, { flag: 'wx', mode: 0o600 });
    return { url: `/uploads/islands/${fileName}` };
  }

  presentPerson(publicKey, fallback = {}) {
    const profile =
      (fallback.uuid ? this.resolveProfile({ uuid: fallback.uuid }) : null) ||
      (publicKey ? this.resolveProfile({ publicKey }) : null);
    return {
      publicKey: String(profile?.publicKey || publicKey || ''),
      userId: String(profile?.userId || fallback.userId || ''),
      name: String(profile?.name || fallback.name || '浮岛旅人'),
      avatarUrl: String(profile?.avatarUrl || fallback.avatarUrl || '')
    };
  }

  presentMembers(island) {
    return Object.values(island.members || {})
      .map((member) => {
        const person = this.presentPerson(member.publicKey, member);
        return {
          ...person,
          joinedAt: member.joinedAt,
          lastVisitedAt: member.lastVisitedAt || member.joinedAt
        };
      })
      .sort((a, b) => (Date.parse(b.lastVisitedAt) || 0) - (Date.parse(a.lastVisitedAt) || 0));
  }

  presentSummary(island, viewerProfile = null, options = {}) {
    const isOwner = Boolean(viewerProfile && island.ownerPublicKey === viewerProfile.publicKey);
    const includeSecrets = options.isAdmin === true || isOwner;
    const members = this.presentMembers(island);
    return {
      id: island.id,
      name: island.name,
      owner: this.presentPerson(island.ownerPublicKey, {
        uuid: island.ownerUuid,
        userId: island.ownerUserId,
        name: island.ownerName,
        avatarUrl: island.ownerAvatarUrl
      }),
      isOwner,
      memberCount: members.length,
      itemCount: Array.isArray(island.items) ? island.items.length : 0,
      onlineCount: Number(options.onlineCount) || 0,
      updatedAt: island.updatedAt,
      createdAt: island.createdAt,
      ...(includeSecrets
        ? {
            inviteToken: island.inviteToken,
            inviteExpiresAt: island.inviteExpiresAt,
            inviteExpired: this.isInviteExpired(island),
            members
          }
        : {})
    };
  }

  presentItem(item) {
    const cloned = clone(item);
    if (!cloned) return cloned;
    const author = this.presentPerson(cloned.authorPublicKey, { name: cloned.authorName });
    return {
      ...cloned,
      authorName: author.name
    };
  }

  presentItems(items) {
    return Array.isArray(items) ? items.map((item) => this.presentItem(item)) : [];
  }

  presentDetail(island, viewerProfile = null, options = {}) {
    const summary = this.presentSummary(island, viewerProfile, options);
    return {
      ...summary,
      items: this.presentItems(island.items),
      members: this.presentMembers(island),
      canEdit: this.canEditIsland(island, viewerProfile),
      ...(options.isAdmin === true ? { isAdmin: true } : {})
    };
  }

  presentAdminSummary(island, onlineCount = 0) {
    return this.presentSummary(island, null, { isAdmin: true, onlineCount });
  }

  presentAdminDetail(island, onlineCount = 0) {
    return {
      ...this.presentAdminSummary(island, onlineCount),
      items: this.presentItems(island.items)
    };
  }

  normalizeStoredIsland(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('invalid stored island');
    const id = String(raw.id || '').trim();
    if (!ID_PATTERN.test(id)) throw new Error('invalid stored island id');
    const ownerPublicKey = String(raw.ownerPublicKey || '').trim();
    if (!ownerPublicKey) throw new Error('invalid stored island owner');
    const createdAt = this.requireDate(raw.createdAt);
    const updatedAt = this.requireDate(raw.updatedAt || createdAt);
    const members = {};
    if (raw.members && typeof raw.members === 'object' && !Array.isArray(raw.members)) {
      for (const [key, value] of Object.entries(raw.members)) {
        if (!key || !value || typeof value !== 'object') continue;
        members[key] = {
          publicKey: String(value.publicKey || key),
          uuid: String(value.uuid || ''),
          userId: String(value.userId || ''),
          name: sanitizeText(value.name || '浮岛访客', 32),
          avatarUrl: String(value.avatarUrl || ''),
          joinedAt: this.requireDate(value.joinedAt || createdAt),
          lastVisitedAt: this.requireDate(value.lastVisitedAt || value.joinedAt || createdAt)
        };
      }
    }
    const items = Array.isArray(raw.items) ? raw.items.map((item) => this.normalizeStoredItem(item, createdAt)) : [];
    return {
      id,
      ownerUuid: String(raw.ownerUuid || ''),
      ownerPublicKey,
      ownerUserId: String(raw.ownerUserId || ''),
      ownerName: sanitizeText(raw.ownerName || '浮岛主人', 32),
      ownerAvatarUrl: String(raw.ownerAvatarUrl || ''),
      name: sanitizeText(raw.name || '我的浮岛', MAX_ISLAND_NAME_LENGTH).trim() || '我的浮岛',
      passcode: String(raw.passcode || this.generatePasscode()).trim().toUpperCase(),
      inviteToken: String(raw.inviteToken || randomBytes(12).toString('base64url')).trim(),
      inviteExpiresAt: this.requireDate(raw.inviteExpiresAt || new Date(Date.parse(createdAt) + INVITE_TTL_MS).toISOString()),
      allowVisitorEdit: raw.allowVisitorEdit !== false,
      members,
      items,
      createdAt,
      updatedAt
    };
  }

  normalizeStoredItem(raw, fallbackDate) {
    const type = String(raw?.type || '').trim();
    if (!ITEM_TYPES.has(type)) throw new Error('invalid stored item type');
    const id = String(raw?.id || '').trim();
    if (!ID_PATTERN.test(id)) throw new Error('invalid stored item id');
    return {
      id,
      type,
      x: clampNumber(raw.x, -50000, 50000, 0),
      y: clampNumber(raw.y, -50000, 50000, 0),
      w: clampNumber(raw.w, 16, 2000, 200),
      h: clampNumber(raw.h, 16, 2000, 200),
      rotation: clampNumber(raw.rotation, -360, 360, 0),
      zIndex: Math.round(clampNumber(raw.zIndex, 0, 1000000, 1)),
      authorPublicKey: String(raw.authorPublicKey || ''),
      authorName: sanitizeText(raw.authorName || '浮岛旅人', 32),
      data: this.normalizeItemData(type, raw.data),
      createdAt: this.requireDate(raw.createdAt || fallbackDate),
      updatedAt: this.requireDate(raw.updatedAt || raw.createdAt || fallbackDate)
    };
  }

  requireDate(value) {
    const text = String(value || '').trim();
    if (!text || Number.isNaN(Date.parse(text))) throw new Error('invalid stored date');
    return text;
  }
}

const islandRepository = new IslandRepository();

module.exports = {
  IslandRepository,
  IslandRepositoryError,
  INVITE_TTL_MS,
  PASSCODE_ALPHABET,
  islandRepository
};
