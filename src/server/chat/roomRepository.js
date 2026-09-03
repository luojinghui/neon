const fs = require('fs');
const path = require('path');
const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('crypto');

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;
const PASSWORD_PATTERN = /^[A-Za-z0-9]{2,4}$/;
const CHAT_DATA_VERSION = 2;

class RoomRepositoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RoomRepositoryError';
    this.code = code;
  }
}

const DEFAULT_ROOMS = [
  {
    id: 'soul-harbor',
    code: 'LH01',
    name: '随便聊聊',
    description: '路过也好，常驻也好。聊聊近况，分享有趣的事，不必先想好主题。',
    tags: ['日常', '闲聊'],
    ownerId: 'planet-system',
    isPrivate: false,
    isFixed: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'starlight-camp',
    code: 'XL01',
    name: '灵感晾晒场',
    description: '把刚冒头的点子放这儿晒晒，半成品也值得一个回声。',
    tags: ['灵感', '脑洞', '创作'],
    ownerId: 'planet-system',
    isPrivate: false,
    isFixed: true,
    createdAt: '2026-01-01T00:01:00.000Z'
  }
];

const RETIRED_DEFAULT_ROOM_IDS = new Set(['inspiration-orbit']);

const DEFAULT_MESSAGES = DEFAULT_ROOMS.map((room, index) => ({
  id: `welcome-${room.id}`,
  roomId: room.id,
  senderId: 'planetguide',
  senderKey: 'planetguide',
  senderName: '星球向导',
  type: 'text',
  content: [
    '欢迎来坐坐。没有固定话题，想说什么就从什么开始。',
    '先把点子放下，不急着把它讲完整。'
  ][index],
  timestamp: Date.parse(room.createdAt) + 10_000
}));

class RoomRepository {
  constructor(options = {}) {
    this.dataFile = options.dataFile || process.env.SOUL_CHAT_DATA_FILE || path.join(process.cwd(), '.data', 'soul-chat.json');
    this.uploadDirectory = options.uploadDirectory || path.join(process.cwd(), 'public', 'uploads', 'soul');
    this.resolveProfile = typeof options.resolveProfile === 'function' ? options.resolveProfile : null;
    this.rooms = new Map(DEFAULT_ROOMS.map((room) => [room.id, room]));
    this.messages = new Map(DEFAULT_ROOMS.map((room) => [room.id, DEFAULT_MESSAGES.filter((message) => message.roomId === room.id)]));
    this.writeQueue = Promise.resolve();
    this.cleanupQueue = Promise.resolve();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const storedMessages = Array.isArray(data.messages) ? data.messages : [];
      if (data.version !== CHAT_DATA_VERSION) {
        for (const message of storedMessages) this.deleteStoredAttachment(message);
        this.persist();
        return;
      }

      let migrated = false;
      for (const storedRoom of Array.isArray(data.rooms) ? data.rooms : []) {
        if (!storedRoom?.id) continue;
        if (RETIRED_DEFAULT_ROOM_IDS.has(storedRoom.id)) {
          migrated = true;
          continue;
        }
        const existing = this.rooms.get(storedRoom.id) || {};
        const room = existing.isFixed
          ? {
              ...storedRoom,
              ...existing,
              ...(storedRoom.lastMessageAt ? { lastMessageAt: storedRoom.lastMessageAt } : {}),
              ...(storedRoom.updatedAt ? { updatedAt: storedRoom.updatedAt } : {})
            }
          : { ...existing, ...storedRoom };
        if (
          existing.isFixed &&
          (storedRoom.name !== existing.name ||
            storedRoom.description !== existing.description ||
            storedRoom.code !== existing.code ||
            JSON.stringify(storedRoom.tags) !== JSON.stringify(existing.tags))
        ) {
          migrated = true;
        }
        if (!this.isRoomCode(room.code) || this.isCodeUsedByAnotherRoom(room.code, room.id)) {
          room.code = this.generateRoomCode();
          migrated = true;
        } else {
          room.code = room.code.toUpperCase();
        }
        if (!room.ownerId) {
          room.ownerId = room.isFixed ? 'planet-system' : 'legacy-owner';
          migrated = true;
        }
        if (typeof room.isPrivate !== 'boolean') {
          room.isPrivate = false;
          migrated = true;
        }
        if (!room.isFixed && this.resolveProfile && !this.resolveRoomOwner(room)) {
          migrated = true;
          continue;
        }
        this.rooms.set(room.id, room);
      }
      for (const message of storedMessages) {
        if (!message || !this.rooms.has(message.roomId)) {
          this.deleteStoredAttachment(message);
          migrated = true;
          continue;
        }
        const profile = this.resolveProfile ? this.resolveMessageProfile(message) : null;
        if (this.resolveProfile && !profile) {
          this.deleteStoredAttachment(message);
          migrated = true;
          continue;
        }
        const normalizedMessage = profile ? this.applyProfileToMessage(message, profile) : message;
        if (normalizedMessage !== message) migrated = true;
        const roomMessages = this.messages.get(message.roomId) || [];
        if (!roomMessages.some((item) => item.id === message.id)) roomMessages.push(normalizedMessage);
        this.messages.set(message.roomId, roomMessages);
      }
      for (const room of this.rooms.values()) {
        const latestMessage = (this.messages.get(room.id) || []).reduce(
          (latest, message) => (!latest || Number(message.timestamp) > Number(latest.timestamp) ? message : latest),
          null
        );
        const lastMessageAt = latestMessage && !String(latestMessage.id).startsWith('welcome-') ? new Date(latestMessage.timestamp).toISOString() : null;
        if ((room.lastMessageAt || null) !== lastMessageAt) {
          this.rooms.set(room.id, { ...room, lastMessageAt });
          migrated = true;
        }
      }
      if (migrated) this.persist();
    } catch (error) {
      console.error('Soul chat data could not be loaded:', error.message);
    }
  }

  listRooms() {
    return this.sortRooms([...this.rooms.values()]);
  }

  sortRooms(rooms) {
    return rooms.sort((a, b) => {
      if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
      if (a.isFixed) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      const activityDiff = new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime();
      return activityDiff || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  searchRoom(query) {
    const normalized = this.requireText(query, '星球 ID', 80).toUpperCase();
    return [...this.rooms.values()].find((room) => room.id.toUpperCase() === normalized || room.code.toUpperCase() === normalized) || null;
  }

  createRoom(input, user) {
    const owner = this.normalizeUser(user);
    const code = this.generateRoomCode();
    const room = {
      id: code,
      code,
      name: this.requireText(input.name, '星球名', 32),
      description: this.optionalText(input.description, 200),
      tags: this.normalizeTags(input.tags),
      ownerId: owner.id,
      isPrivate: input.isPrivate === true,
      isFixed: false,
      createdAt: new Date().toISOString(),
      lastMessageAt: null
    };
    this.applyPassword(room, input.passwordEnabled === true, input.password);

    this.rooms.set(room.id, room);
    this.messages.set(room.id, []);
    this.persist();
    return room;
  }

  updateRoom(roomId, input, user) {
    const room = this.requireOwnedRoom(roomId, user);
    const updated = {
      ...room,
      name: this.requireText(input.name, '星球名', 32),
      description: this.optionalText(input.description, 200),
      tags: this.normalizeTags(input.tags),
      isPrivate: input.isPrivate === true,
      updatedAt: new Date().toISOString()
    };
    this.applyPassword(updated, input.passwordEnabled === true, input.password);
    this.rooms.set(room.id, updated);
    this.persist();
    return updated;
  }

  deleteRoom(roomId, user) {
    const room = this.requireOwnedRoom(roomId, user);
    for (const message of this.messages.get(room.id) || []) this.deleteStoredAttachment(message);
    this.rooms.delete(room.id);
    this.messages.delete(room.id);
    this.persist();
    return room;
  }

  verifyRoomAccess(roomId, password) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    if (!room.passwordHash || !room.passwordSalt) return room;
    if (!password) throw new RoomRepositoryError('请输入星球密码', 'ROOM_PASSWORD_REQUIRED');
    if (!PASSWORD_PATTERN.test(password)) throw new RoomRepositoryError('密码必须是 2-4 位数字或字母', 'ROOM_PASSWORD_INVALID');
    const actual = scryptSync(password, room.passwordSalt, 32);
    const expected = Buffer.from(room.passwordHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new RoomRepositoryError('星球密码错误', 'ROOM_PASSWORD_INVALID');
    }
    return room;
  }

  getHistory(roomId, options = {}) {
    if (!this.rooms.has(roomId)) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 50));
    const before = Number(options.before) || Number.POSITIVE_INFINITY;
    const all = (this.messages.get(roomId) || []).filter((message) => message.timestamp < before).sort((a, b) => a.timestamp - b.timestamp);
    const page = all.slice(-limit);
    return { messages: page, hasMore: all.length > page.length, before: page.length > 0 ? page[0].timestamp : null };
  }

  addMessage(roomId, user, input) {
    if (!this.rooms.has(roomId)) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    const type = ['text', 'image', 'gif', 'file'].includes(input?.type) ? input.type : 'text';
    const content = type === 'text' ? this.requireText(input?.content, '消息', 4000) : this.optionalText(input?.content, 4000);
    const attachment = type === 'text' ? undefined : this.normalizeAttachment(input?.attachment, type);
    const message = {
      id: `msg-${randomUUID()}`,
      roomId,
      senderId: user.userId,
      senderKey: user.publicKey,
      senderName: user.name,
      ...(user.avatarUrl ? { senderAvatar: user.avatarUrl } : {}),
      type,
      content,
      ...(attachment ? { attachment } : {}),
      timestamp: Date.now()
    };
    const roomMessages = this.messages.get(roomId) || [];
    roomMessages.push(message);
    if (roomMessages.length > 5000) roomMessages.splice(0, roomMessages.length - 5000);
    this.messages.set(roomId, roomMessages);
    this.rooms.set(roomId, { ...this.rooms.get(roomId), lastMessageAt: new Date(message.timestamp).toISOString() });
    this.persist();
    return message;
  }

  deleteMessage(roomId, messageId, user) {
    const room = this.requireOwnedRoom(roomId, user);
    const roomMessages = this.messages.get(room.id) || [];
    const messageIndex = roomMessages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) throw new RoomRepositoryError('消息不存在或已被删除', 'MESSAGE_NOT_FOUND');
    const [message] = roomMessages.splice(messageIndex, 1);
    const latestMessage = roomMessages[roomMessages.length - 1];
    this.messages.set(room.id, roomMessages);
    this.rooms.set(room.id, { ...room, lastMessageAt: latestMessage ? new Date(latestMessage.timestamp).toISOString() : null });
    this.deleteStoredAttachment(message);
    this.persist();
    return message;
  }

  deleteStoredAttachment(message) {
    const match = /^\/uploads\/soul\/([a-f0-9-]+\.(?:png|jpg|webp|gif|pdf|doc|docx|txt|md|json|csv|xls|xlsx|ppt|pptx|bin))$/.exec(message?.attachment?.url || '');
    if (!match) return this.cleanupQueue;
    this.cleanupQueue = this.cleanupQueue.then(() => fs.promises.unlink(path.join(this.uploadDirectory, match[1]))).catch((error) => {
      if (error.code !== 'ENOENT') console.error('Soul chat attachment could not be deleted:', error.message);
    });
    return this.cleanupQueue;
  }

  toPublicRoom(room) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      tags: room.tags,
      isPrivate: room.isPrivate === true,
      hasPassword: Boolean(room.passwordHash),
      isFixed: room.isFixed === true,
      createdAt: room.createdAt,
      lastMessageAt: room.lastMessageAt || null,
      updatedAt: room.updatedAt || null
    };
  }

  normalizeAttachment(input, type) {
    if (!input || typeof input !== 'object') throw new Error('附件信息不完整');
    const url = this.requireText(input.url, '附件地址', 500);
    const isLocalUpload = /^\/uploads\/soul\/[a-f0-9-]+\.(png|jpg|webp|gif|pdf|doc|docx|txt|md|json|csv|xls|xlsx|ppt|pptx|bin)$/.test(url);
    const isNotoGif = /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[a-f0-9_-]+\/512\.gif$/.test(url);
    if (!isLocalUpload && !(type === 'gif' && isNotoGif)) throw new Error('附件地址不合法');

    const size = Number(input.size) || 0;
    if (!Number.isFinite(size) || size < 0) throw new Error('附件大小不合法');

    return {
      url,
      name: this.requireText(input.name, '附件名', 160),
      size,
      mimeType: this.optionalText(input.mimeType, 100) || 'application/octet-stream'
    };
  }

  normalizeUser(input) {
    return {
      id: this.requireText(input?.id, '用户身份', 80),
      userId: this.requireText(input?.userId || input?.id, '用户 ID', 20),
      publicKey: this.requireText(input?.publicKey || input?.userId || input?.id, '用户身份标识', 80),
      name: this.requireText(input?.name, '用户名', 32),
      avatarUrl: this.optionalText(input?.avatarUrl, 300)
    };
  }

  resolveRoomOwner(room) {
    const match = /^guest-([0-9a-f-]{36})$/i.exec(room?.ownerId || '');
    return match ? this.resolveProfile({ uuid: match[1], publicKey: '', userId: '' }) : null;
  }

  resolveMessageProfile(message) {
    return this.resolveProfile({ uuid: '', publicKey: message?.senderKey || '', userId: message?.senderId || '' });
  }

  applyProfileToMessage(message, profile) {
    const avatarUrl = profile.avatarUrl || '';
    if (
      message.senderId === profile.userId &&
      message.senderKey === profile.publicKey &&
      message.senderName === profile.name &&
      (message.senderAvatar || '') === avatarUrl
    ) {
      return message;
    }
    const normalized = {
      ...message,
      senderId: profile.userId,
      senderKey: profile.publicKey,
      senderName: profile.name
    };
    if (avatarUrl) normalized.senderAvatar = avatarUrl;
    else delete normalized.senderAvatar;
    return normalized;
  }

  requireOwnedRoom(roomId, user) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    if (room.isFixed || room.ownerId !== user?.id) throw new RoomRepositoryError('只有星球创建者可以执行此操作', 'ROOM_OWNER_REQUIRED');
    return room;
  }

  applyPassword(room, enabled, password) {
    if (!enabled) {
      delete room.passwordHash;
      delete room.passwordSalt;
      return;
    }
    if (!password && room.passwordHash && room.passwordSalt) return;
    if (!PASSWORD_PATTERN.test(password || '')) throw new RoomRepositoryError('密码必须是 2-4 位数字或字母', 'ROOM_PASSWORD_INVALID');
    const salt = randomBytes(16).toString('hex');
    room.passwordSalt = salt;
    room.passwordHash = scryptSync(password, salt, 32).toString('hex');
  }

  normalizeTags(input) {
    return [...new Set((Array.isArray(input) ? input : []).map((tag) => this.optionalText(tag, 12)).filter(Boolean))].slice(0, 5);
  }

  generateRoomCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      let code = '';
      for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      if (!this.rooms.has(code) && !this.isCodeUsedByAnotherRoom(code)) return code;
    }
    throw new Error('暂时无法生成星球 ID，请重试');
  }

  isRoomCode(value) {
    return typeof value === 'string' && /^[A-Za-z0-9]{2,4}$/.test(value);
  }

  isCodeUsedByAnotherRoom(code, roomId = '') {
    if (!code) return false;
    const normalized = code.toUpperCase();
    return [...this.rooms.values()].some((room) => room.id !== roomId && room.code?.toUpperCase() === normalized);
  }

  requireText(value, fieldName, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new Error(`${fieldName}不能为空`);
    if (text.length > maxLength) throw new Error(`${fieldName}不能超过 ${maxLength} 个字符`);
    return text;
  }

  optionalText(value, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.slice(0, maxLength);
  }

  persist() {
    const snapshot = JSON.stringify({ version: CHAT_DATA_VERSION, rooms: this.sortRooms([...this.rooms.values()]), messages: [...this.messages.values()].flat() }, null, 2);
    const tempFile = `${this.dataFile}.tmp`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.promises.writeFile(tempFile, snapshot, 'utf8');
        await fs.promises.rename(tempFile, this.dataFile);
      })
      .catch((error) => console.error('Soul chat data could not be saved:', error.message));
    return this.writeQueue;
  }
}

module.exports = { CHAT_DATA_VERSION, RoomRepository, RoomRepositoryError };
