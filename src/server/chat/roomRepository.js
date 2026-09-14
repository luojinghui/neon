const fs = require('fs');
const path = require('path');
const { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } = require('crypto');

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;
const PASSWORD_PATTERN = /^[A-Za-z0-9]{2,4}$/;
const ROOM_ACCESS_MAX_ATTEMPTS = 5;
const CHAT_DATA_VERSION = 2;
const RPS_CHOICES = ['rock', 'paper', 'scissors'];
const GAME_CREATE_INTERVAL_MS = 700;
const GAME_GUESS_INTERVAL_MS = 800;

class RoomRepositoryError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'RoomRepositoryError';
    this.code = code;
    if (data !== undefined) this.data = data;
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
    this.roomAccess = new Map();
    this.gameActivity = new Map();
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
        if (room.isPrivate && (room.passwordHash || room.passwordSalt)) {
          delete room.passwordHash;
          delete room.passwordSalt;
          migrated = true;
        }
        if (room.isPrivate && !this.isInviteToken(room.inviteToken)) {
          room.inviteToken = this.generateInviteToken();
          migrated = true;
        }
        if (!room.isPrivate && room.inviteToken) {
          delete room.inviteToken;
          migrated = true;
        }
        if (!room.isFixed && this.resolveProfile && !this.resolveRoomOwner(room)) {
          migrated = true;
          continue;
        }
        this.rooms.set(room.id, room);
      }
      for (const storedAccess of Array.isArray(data.roomAccess) ? data.roomAccess : []) {
        const room = this.rooms.get(storedAccess?.roomId);
        if (!room?.isPrivate || !storedAccess?.requesterId || room.ownerId === storedAccess.requesterId) {
          migrated = true;
          continue;
        }
        const profile = this.resolveAccessProfile(storedAccess);
        if (this.resolveProfile && !profile) {
          migrated = true;
          continue;
        }
        const record = this.normalizeStoredAccess(storedAccess, profile);
        if (!record) {
          migrated = true;
          continue;
        }
        if (JSON.stringify(record) !== JSON.stringify(storedAccess)) migrated = true;
        this.roomAccess.set(this.accessKey(record.roomId, record.requesterId), record);
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

  listRooms(user, options = {}) {
    return this.sortRooms([...this.rooms.values()].filter((room) => this.canViewRoom(room, user, options.isAdmin === true)));
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
    return [...this.rooms.values()].find((item) => item.id.toUpperCase() === normalized || item.code.toUpperCase() === normalized) || null;
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
      ...(input.isPrivate === true ? { inviteToken: this.generateInviteToken() } : {}),
      isFixed: false,
      createdAt: new Date().toISOString(),
      lastMessageAt: null
    };
    this.applyPassword(room, !room.isPrivate && input.passwordEnabled === true, input.password);

    this.rooms.set(room.id, room);
    this.messages.set(room.id, []);
    this.persist();
    return room;
  }

  updateRoom(roomId, input, user) {
    const room = this.requireOwnedRoom(roomId, user);
    return this.updateRoomRecord(room, input);
  }

  updateRoomAsAdmin(roomId, input) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    return this.updateRoomRecord(room, input);
  }

  updateRoomRecord(room, input) {
    const wasPrivate = room.isPrivate === true;
    const updated = {
      ...room,
      name: this.requireText(input.name, '星球名', 32),
      description: this.optionalText(input.description, 200),
      tags: this.normalizeTags(input.tags),
      isPrivate: input.isPrivate === true,
      updatedAt: new Date().toISOString()
    };
    if (updated.isPrivate && !wasPrivate) updated.inviteToken = this.generateInviteToken();
    if (!updated.isPrivate) delete updated.inviteToken;
    this.applyPassword(updated, !updated.isPrivate && input.passwordEnabled === true, input.password);
    if (wasPrivate !== updated.isPrivate) this.deleteRoomAccessRecords(room.id);
    this.rooms.set(room.id, updated);
    this.persist();
    return updated;
  }

  deleteRoom(roomId, user) {
    const room = this.requireOwnedRoom(roomId, user);
    return this.deleteRoomRecord(room);
  }

  deleteRoomAsAdmin(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    return this.deleteRoomRecord(room);
  }

  deleteRoomRecord(room) {
    for (const message of this.messages.get(room.id) || []) this.deleteStoredAttachment(message);
    this.rooms.delete(room.id);
    this.messages.delete(room.id);
    this.deleteRoomAccessRecords(room.id);
    this.persist();
    return room;
  }

  verifyRoomAccess(roomId, password, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    if (room.isPrivate) {
      if (!this.canViewRoom(room, options.user, options.isAdmin === true) && this.isValidInviteToken(room, options.inviteToken)) {
        this.grantRoomAccessByInvite(room, options.user);
      }
      if (!this.canViewRoom(room, options.user, options.isAdmin === true)) {
        const access = this.getRoomAccessState(room.id, options.user);
        const messages = {
          pending: ['访问申请正在等待创建人处理', 'ROOM_ACCESS_PENDING'],
          rejected: ['访问申请未通过，可以重新申请', 'ROOM_ACCESS_REJECTED'],
          exhausted: ['已达到 5 次申请上限', 'ROOM_ACCESS_EXHAUSTED']
        };
        const [message, code] = messages[access.status] || ['该私密星球需要申请后访问', 'ROOM_ACCESS_REQUIRED'];
        throw new RoomRepositoryError(message, code, { access });
      }
      return room;
    }
    if (options.isAdmin === true) return room;
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

  getRoomAccessState(roomId, user) {
    const record = user?.id ? this.roomAccess.get(this.accessKey(roomId, user.id)) : null;
    const attemptCount = Math.max(0, Math.min(ROOM_ACCESS_MAX_ATTEMPTS, Number(record?.attemptCount) || 0));
    let status = record?.status || 'none';
    if (status === 'rejected' && attemptCount >= ROOM_ACCESS_MAX_ATTEMPTS) status = 'exhausted';
    if (status === 'revoked') status = 'none';
    return { status, attemptCount, remainingAttempts: Math.max(0, ROOM_ACCESS_MAX_ATTEMPTS - attemptCount) };
  }

  requestRoomAccess(roomId, user) {
    const room = this.getRoomOrThrow(roomId);
    const requester = this.normalizeUser(user);
    if (!room.isPrivate) throw new RoomRepositoryError('公开星球无需申请', 'ROOM_ACCESS_NOT_REQUIRED');
    if (room.ownerId === requester.id || this.hasApprovedAccess(room.id, requester.id)) {
      throw new RoomRepositoryError('你已经拥有该星球的访问权限', 'ROOM_ACCESS_ALREADY_GRANTED');
    }

    const key = this.accessKey(room.id, requester.id);
    const current = this.roomAccess.get(key);
    if (current?.status === 'pending') throw new RoomRepositoryError('访问申请正在等待处理', 'ROOM_ACCESS_PENDING', { access: this.getRoomAccessState(room.id, requester) });
    const previousAttempts = current?.status === 'revoked' ? 0 : Number(current?.attemptCount) || 0;
    if (previousAttempts >= ROOM_ACCESS_MAX_ATTEMPTS) {
      throw new RoomRepositoryError('已达到 5 次申请上限', 'ROOM_ACCESS_EXHAUSTED', { access: this.getRoomAccessState(room.id, requester) });
    }

    const now = new Date().toISOString();
    const record = {
      id: current?.id || `access-${randomUUID()}`,
      roomId: room.id,
      requesterId: requester.id,
      requesterUserId: requester.userId,
      requesterPublicKey: requester.publicKey,
      requesterName: requester.name,
      requesterAvatarUrl: requester.avatarUrl,
      status: 'pending',
      source: 'request',
      attemptCount: previousAttempts + 1,
      createdAt: current?.createdAt || now,
      requestedAt: now,
      updatedAt: now
    };
    delete record.decidedAt;
    delete record.decidedBy;
    this.roomAccess.set(key, record);
    this.persist();
    return record;
  }

  decideRoomAccess(roomId, requesterId, decision, actor, options = {}) {
    const room = this.requireManagedRoom(roomId, actor, options.isAdmin === true);
    if (!['approved', 'rejected'].includes(decision)) throw new RoomRepositoryError('申请处理操作无效', 'ROOM_ACCESS_DECISION_INVALID');
    const key = this.accessKey(room.id, requesterId);
    const current = this.roomAccess.get(key);
    if (!current || current.status !== 'pending') throw new RoomRepositoryError('待处理的申请不存在', 'ROOM_ACCESS_REQUEST_NOT_FOUND');
    const now = new Date().toISOString();
    const updated = {
      ...current,
      status: decision,
      source: 'request',
      decidedAt: now,
      decidedBy: options.isAdmin === true ? `admin:${options.adminId || 'super'}` : actor.id,
      updatedAt: now
    };
    this.roomAccess.set(key, updated);
    this.persist();
    return { room, record: updated };
  }

  revokeRoomAccess(roomId, requesterId, actor, options = {}) {
    const room = this.requireManagedRoom(roomId, actor, options.isAdmin === true);
    const key = this.accessKey(room.id, requesterId);
    const current = this.roomAccess.get(key);
    if (!current || current.status !== 'approved') throw new RoomRepositoryError('已授权成员不存在', 'ROOM_ACCESS_MEMBER_NOT_FOUND');
    const now = new Date().toISOString();
    const updated = { ...current, status: 'revoked', attemptCount: 0, decidedAt: now, decidedBy: options.isAdmin === true ? `admin:${options.adminId || 'super'}` : actor.id, updatedAt: now };
    this.roomAccess.set(key, updated);
    this.persist();
    return { room, record: updated };
  }

  getRoomAccessManagement(roomId, actor, options = {}) {
    const room = this.requireManagedRoom(roomId, actor, options.isAdmin === true);
    const records = this.getRoomAccessRecords(room.id).map((record) => this.toPublicAccessRecord(record));
    return {
      roomId: room.id,
      ...(room.isPrivate ? { inviteToken: room.inviteToken } : {}),
      applications: records.filter((record) => record.status !== 'approved'),
      members: records.filter((record) => record.status === 'approved'),
      pendingCount: records.filter((record) => record.status === 'pending').length
    };
  }

  rotateInviteToken(roomId, user) {
    const room = this.requireOwnedRoom(roomId, user);
    if (!room.isPrivate) throw new RoomRepositoryError('只有私密星球需要邀请链接', 'ROOM_INVITE_NOT_REQUIRED');
    const updated = { ...room, inviteToken: this.generateInviteToken(), updatedAt: new Date().toISOString() };
    this.rooms.set(room.id, updated);
    this.persist();
    return updated.inviteToken;
  }

  listAllRoomAccess() {
    return [...this.roomAccess.values()]
      .filter((record) => this.rooms.has(record.roomId))
      .map((record) => ({ ...this.toPublicAccessRecord(record), room: this.toPublicRoom(this.rooms.get(record.roomId)) }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getHistory(roomId, options = {}) {
    if (!this.rooms.has(roomId)) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 50));
    const before = Number(options.before) || Number.POSITIVE_INFINITY;
    const all = (this.messages.get(roomId) || []).filter((message) => message.timestamp < before).sort((a, b) => a.timestamp - b.timestamp);
    const page = all.slice(-limit);
    return { messages: page.map((message) => this.toPublicMessage(message, options.user)), hasMore: all.length > page.length, before: page.length > 0 ? page[0].timestamp : null };
  }

  addMessage(roomId, user, input) {
    if (!this.rooms.has(roomId)) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
    if (input?.type === 'game') throw new RoomRepositoryError('请通过小游戏入口发起游戏', 'GAME_CREATE_REQUIRED');
    if (input?.type === 'poll' || input?.type === 'poll-result') throw new RoomRepositoryError('请通过投票入口发起投票', 'POLL_CREATE_REQUIRED');
    const sender = this.normalizeUser(user);
    const type = ['text', 'image', 'gif', 'file'].includes(input?.type) ? input.type : 'text';
    const content = type === 'text' ? this.requireText(input?.content, '消息', 4000) : this.optionalText(input?.content, 4000);
    const attachment = type === 'text' ? undefined : this.normalizeAttachment(input?.attachment, type);
    const replyTo = this.resolveReplyTo(roomId, sender, input?.replyToId);
    const message = {
      id: `msg-${randomUUID()}`,
      roomId,
      senderId: sender.userId,
      senderKey: sender.publicKey,
      senderName: sender.name,
      ...(sender.avatarUrl ? { senderAvatar: sender.avatarUrl } : {}),
      type,
      content,
      ...(attachment ? { attachment } : {}),
      ...(replyTo ? { replyTo } : {}),
      timestamp: Date.now()
    };
    return this.storeMessage(message);
  }

  storeMessage(message) {
    const { roomId } = message;
    const roomMessages = this.messages.get(roomId) || [];
    roomMessages.push(message);
    this.trimRoomMessages(roomMessages, new Set([message.id]));
    this.messages.set(roomId, roomMessages);
    this.rooms.set(roomId, { ...this.rooms.get(roomId), lastMessageAt: new Date(message.timestamp).toISOString() });
    this.persist();
    return this.toPublicMessage(message);
  }

  trimRoomMessages(roomMessages, retainedIds = new Set()) {
    // 保留进行中的投票及刚写入的消息，避免历史截断导致投票失效或无法结算。
    // 其余消息按 5,000 条上限淘汰；活跃投票本身超过上限时允许暂时超出。
    let excess = roomMessages.length - 5000;
    if (excess <= 0) return;
    for (let index = 0; index < roomMessages.length && excess > 0;) {
      if (retainedIds.has(roomMessages[index].id) || (roomMessages[index].type === 'poll' && roomMessages[index].poll?.status === 'open')) {
        index += 1;
      } else {
        roomMessages.splice(index, 1);
        excess -= 1;
      }
    }
  }

  getStoredMessage(roomId, messageId) {
    return (this.messages.get(roomId) || []).find((message) => message.id === messageId) || null;
  }

  createPoll(roomId, user, input) {
    this.getRoomOrThrow(roomId);
    const sender = this.normalizeUser(user);
    const question = this.requirePollText(input?.question, '问题', 200, 'POLL_QUESTION_INVALID');
    if (!Array.isArray(input?.options) || input.options.length < 2 || input.options.length > 10) {
      throw new RoomRepositoryError('请设置 2–10 个投票选项', 'POLL_OPTIONS_INVALID');
    }
    const texts = input.options.map((text) => this.requirePollText(text, '选项', 100, 'POLL_OPTIONS_INVALID'));
    if (new Set(texts).size !== texts.length) throw new RoomRepositoryError('投票选项不能重复', 'POLL_OPTIONS_INVALID');
    const now = Date.now();
    const deadlineAt = input.deadlineAt;
    if (deadlineAt !== undefined && (typeof deadlineAt !== 'number' || !Number.isSafeInteger(deadlineAt) || deadlineAt <= now || deadlineAt > 8.64e15)) {
      throw new RoomRepositoryError('截止时间必须是未来的有效时间', 'POLL_DEADLINE_INVALID');
    }
    const poll = {
      question,
      options: texts.map((text) => ({ id: `option-${randomUUID()}`, text, count: 0 })),
      status: 'open',
      totalVotes: 0,
      ...(deadlineAt !== undefined ? { deadlineAt } : {})
    };
    const message = {
      id: `msg-${randomUUID()}`,
      roomId,
      senderId: sender.userId,
      senderKey: sender.publicKey,
      senderName: sender.name,
      ...(sender.avatarUrl ? { senderAvatar: sender.avatarUrl } : {}),
      type: 'poll',
      content: this.summarizePoll(poll),
      poll,
      pollRevision: 0,
      _pollPrivate: { hostId: sender.id, votes: {} },
      timestamp: now
    };
    this.storeMessage(message);
    return this.toPublicMessage(message, sender);
  }

  requirePollText(value, fieldName, maxLength, code) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || Array.from(text).length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      throw new RoomRepositoryError(`${fieldName}需要 1–${maxLength} 个字符`, code);
    }
    return text;
  }

  requirePollMessage(roomId, messageId) {
    this.getRoomOrThrow(roomId);
    const message = this.getStoredMessage(roomId, messageId);
    if (!message || message.type !== 'poll' || !message.poll) throw new RoomRepositoryError('投票不存在或已被删除', 'POLL_NOT_FOUND');
    return message;
  }

  getPoll(roomId, messageId, user) {
    this.getRoomOrThrow(roomId);
    // 原卡片被历史截断后，仍可通过其 ID 打开群里的最终结果快照。
    const message = this.getStoredMessage(roomId, messageId) || (this.messages.get(roomId) || []).find((entry) => entry.type === 'poll-result' && entry.pollSourceId === messageId);
    if (message?.type === 'poll-result' && message.poll) {
      const source = this.getStoredMessage(roomId, message.pollSourceId);
      return this.toPublicMessage(source?.type === 'poll' ? source : message, user);
    }
    return this.toPublicMessage(this.requirePollMessage(roomId, messageId), user);
  }

  votePoll(roomId, messageId, user, input) {
    const actor = this.normalizeUser(user);
    const message = this.requirePollMessage(roomId, messageId);
    if (message.poll.status !== 'open' || (message.poll.deadlineAt !== undefined && message.poll.deadlineAt <= Date.now())) {
      throw new RoomRepositoryError('投票已结束，不能再修改答案', 'POLL_CLOSED');
    }
    const optionId = input?.optionId;
    if (typeof optionId !== 'string' || !message.poll.options.some((option) => option.id === optionId)) {
      throw new RoomRepositoryError('请选择有效的投票选项', 'POLL_OPTION_INVALID');
    }
    const previousVotes = message._pollPrivate?.votes || {};
    if (Object.hasOwn(previousVotes, actor.id) && previousVotes[actor.id] === optionId) return this.toPublicMessage(message, actor);
    const votes = { ...previousVotes, [actor.id]: optionId };
    const counts = new Map(message.poll.options.map((option) => [option.id, 0]));
    for (const selected of Object.values(votes)) {
      if (counts.has(selected)) counts.set(selected, counts.get(selected) + 1);
    }
    const updated = {
      ...message,
      poll: { ...message.poll, options: message.poll.options.map((option) => ({ ...option, count: counts.get(option.id) })), totalVotes: [...counts.values()].reduce((total, count) => total + count, 0) },
      pollRevision: (Number(message.pollRevision) || 0) + 1,
      _pollPrivate: { ...message._pollPrivate, votes }
    };
    const roomMessages = this.messages.get(roomId);
    roomMessages[roomMessages.indexOf(message)] = updated;
    this.persist();
    return this.toPublicMessage(updated, actor);
  }

  closePoll(roomId, messageId, user) {
    const actor = this.normalizeUser(user);
    const message = this.requirePollMessage(roomId, messageId);
    if (message._pollPrivate?.hostId !== actor.id) throw new RoomRepositoryError('只有发起人可以结束投票', 'POLL_HOST_REQUIRED');
    const now = Date.now();
    const reason = message.poll.deadlineAt !== undefined && message.poll.deadlineAt <= now ? 'deadline' : 'manual';
    return this.finishPoll(message, reason, now, actor);
  }

  closeExpiredPolls(now = Date.now()) {
    const candidates = [];
    const retainedIds = new Set();
    for (const roomMessages of this.messages.values()) {
      for (const message of roomMessages) {
        if (message.type === 'poll' && message.poll?.status === 'open' && message.poll.deadlineAt !== undefined && message.poll.deadlineAt <= now) {
          candidates.push(message);
          retainedIds.add(message.id);
          retainedIds.add(`poll-result-${message.id}`);
        }
      }
    }
    // 整轮结算共享保留集合，保证后续结算不会在广播前淘汰前面的原卡片或结果。
    return candidates.map((message) => this.finishPoll(message, 'deadline', now, undefined, retainedIds));
  }

  finishPoll(message, reason, now, user, retainedIds = new Set()) {
    const roomMessages = this.messages.get(message.roomId);
    const created = message.poll.status === 'open';
    const updated = created ? {
      ...message,
      poll: { ...message.poll, status: 'closed', closedAt: reason === 'deadline' ? message.poll.deadlineAt : now, closeReason: reason },
      pollRevision: (Number(message.pollRevision) || 0) + 1,
      _pollPrivate: { ...message._pollPrivate, resultTimestamp: now }
    } : message;
    updated.content = this.summarizePoll(updated.poll);
    const resultId = `poll-result-${message.id}`;
    const resultMessage = this.getStoredMessage(message.roomId, resultId) || {
      id: resultId,
      roomId: message.roomId,
      senderId: message.senderId,
      senderKey: message.senderKey,
      senderName: message.senderName,
      ...(message.senderAvatar ? { senderAvatar: message.senderAvatar } : {}),
      type: 'poll-result',
      content: this.summarizePoll(updated.poll, true),
      poll: { ...updated.poll, options: updated.poll.options.map((option) => ({ ...option })) },
      pollRevision: updated.pollRevision,
      pollSourceId: message.id,
      timestamp: updated._pollPrivate?.resultTimestamp ?? updated.poll.closedAt
    };
    if (created) {
      // 先同步更新原卡片并追加结果，再统一持久化，避免并发操作重复结算。
      roomMessages[roomMessages.indexOf(message)] = updated;
      if (!roomMessages.some((entry) => entry.id === resultId)) roomMessages.push(resultMessage);
      retainedIds.add(updated.id);
      retainedIds.add(resultId);
      this.trimRoomMessages(roomMessages, retainedIds);
      const room = this.rooms.get(message.roomId);
      this.rooms.set(message.roomId, { ...room, lastMessageAt: new Date(Math.max(Date.parse(room.lastMessageAt) || 0, resultMessage.timestamp)).toISOString() });
      this.persist();
    }
    return { message: this.toPublicMessage(updated, user), resultMessage: this.toPublicMessage(resultMessage, user), created };
  }

  summarizePoll(poll, isResult = false) {
    return `${isResult ? '📊 投票结果' : poll.status === 'closed' ? '📊 投票已结束' : '📊 发起投票'}：${poll.question}`;
  }

  resolveReplyTo(roomId, user, messageId) {
    if (messageId === undefined || messageId === null) return undefined;
    if (typeof messageId !== 'string' || !messageId || messageId.length > 100) {
      throw new RoomRepositoryError('要回复的消息无效', 'REPLY_INVALID');
    }
    const source = (this.messages.get(roomId) || []).find((message) => message.id === messageId);
    if (!source) throw new RoomRepositoryError('要回复的消息不存在或已被删除', 'REPLY_NOT_FOUND');
    if (source.senderKey === user.publicKey || (!source.senderKey && source.senderId === user.userId)) {
      throw new RoomRepositoryError('请选择其他人的消息进行快速回复', 'REPLY_SELF_NOT_ALLOWED');
    }
    const content = source.type === 'game'
      ? this.summarizeGame(source.game)
      : source.content || ({ image: '[图片]', gif: '[表情]', file: `[文件] ${source.attachment?.name || ''}` }[source.type] || '');
    return { id: source.id, senderName: source.senderName, content: Array.from(content).slice(0, 160).join(''), type: source.type };
  }

  createGame(roomId, user, input) {
    this.getRoomOrThrow(roomId);
    const sender = this.normalizeUser(user);
    let game;
    const privateState = { hostId: sender.id };
    switch (input?.kind) {
      case 'dice':
        game = { kind: 'dice', value: randomInt(1, 7) };
        break;
      case 'rps':
        privateState.hostChoice = this.requireRpsChoice(input.choice);
        game = { kind: 'rps', status: 'waiting' };
        break;
      case 'draw': {
        const answer = this.requireGameText(input.word, '答案', 12);
        if (Array.from(answer).length < 2) throw new RoomRepositoryError('答案需要 2–12 个字符', 'GAME_ANSWER_INVALID');
        privateState.answer = answer;
        game = { kind: 'draw', status: 'playing', strokes: this.normalizeDrawing(input.strokes), wordLength: Array.from(answer).length, guesses: [] };
        break;
      }
      default:
        throw new RoomRepositoryError('不支持的小游戏', 'GAME_KIND_INVALID');
    }
    this.requireGameRate(sender.id, 'create', GAME_CREATE_INTERVAL_MS);
    return this.storeMessage({
      id: `msg-${randomUUID()}`,
      roomId,
      senderId: sender.userId,
      senderKey: sender.publicKey,
      senderName: sender.name,
      ...(sender.avatarUrl ? { senderAvatar: sender.avatarUrl } : {}),
      type: 'game',
      content: this.summarizeGame(game),
      game,
      gameRevision: 0,
      _gamePrivate: privateState,
      timestamp: Date.now()
    });
  }

  actOnGame(roomId, messageId, user, input) {
    this.getRoomOrThrow(roomId);
    const actor = this.normalizeUser(user);
    const roomMessages = this.messages.get(roomId) || [];
    const index = roomMessages.findIndex((message) => message.id === messageId && message.type === 'game');
    if (index < 0) throw new RoomRepositoryError('游戏不存在或已被删除', 'GAME_NOT_FOUND');
    const message = roomMessages[index];
    const privateState = message._gamePrivate || {};
    const isHost = privateState.hostId ? privateState.hostId === actor.id : message.senderKey === actor.publicKey;
    let game = { ...message.game };

    if (game.kind === 'rps') {
      if (game.status !== 'waiting') throw new RoomRepositoryError('这轮猜拳已经结束', 'GAME_ENDED');
      if (input?.action === 'finish') {
        if (!isHost) throw new RoomRepositoryError('只有发起人可以取消这轮猜拳', 'GAME_HOST_REQUIRED');
        game.status = 'cancelled';
      } else if (input?.action === 'join') {
        if (isHost) throw new RoomRepositoryError('等另一位星友来应战吧', 'GAME_SELF_JOIN');
        const hostChoice = this.requireRpsChoice(privateState.hostChoice);
        const choice = this.requireRpsChoice(input.choice);
        const winner = choice === hostChoice ? 'draw' : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[hostChoice] === choice ? 'host' : 'guest');
        game = { ...game, status: 'completed', guest: { userId: actor.userId, publicKey: actor.publicKey, name: actor.name, choice }, winner };
      } else {
        throw new RoomRepositoryError('猜拳操作无效', 'GAME_ACTION_INVALID');
      }
    } else if (game.kind === 'draw') {
      if (game.status !== 'playing') throw new RoomRepositoryError('这轮你画我猜已经结束', 'GAME_ENDED');
      if (input?.action === 'finish') {
        if (!isHost) throw new RoomRepositoryError('只有画画的人可以揭晓答案', 'GAME_HOST_REQUIRED');
        game.status = 'completed';
      } else if (input?.action === 'guess') {
        if (isHost) throw new RoomRepositoryError('把答案留给其他星友来猜吧', 'GAME_SELF_GUESS');
        const guess = this.requireGameText(input.guess, '猜测', 40);
        this.requireGameRate(actor.id, 'guess', GAME_GUESS_INTERVAL_MS);
        const correct = this.normalizeGuess(guess) === this.normalizeGuess(privateState.answer);
        const entry = { userId: actor.userId, publicKey: actor.publicKey, name: actor.name, text: guess, correct, timestamp: Date.now() };
        game.guesses = [...(game.guesses || []), entry].slice(-20);
        if (correct) {
          game.status = 'completed';
          game.winnerName = actor.name;
        }
      } else {
        throw new RoomRepositoryError('你画我猜操作无效', 'GAME_ACTION_INVALID');
      }
    } else {
      throw new RoomRepositoryError('这个游戏没有可执行的操作', 'GAME_ACTION_INVALID');
    }

    // This synchronous replacement makes simultaneous socket actions observe the
    // latest status before they can claim the same game or reveal it twice.
    const updated = { ...message, game, gameRevision: (Number(message.gameRevision) || 0) + 1, content: this.summarizeGame(game) };
    roomMessages[index] = updated;
    this.persist();
    return this.toPublicMessage(updated);
  }

  requireRpsChoice(choice) {
    if (!RPS_CHOICES.includes(choice)) throw new RoomRepositoryError('请选择石头、剪刀或布', 'GAME_CHOICE_INVALID');
    return choice;
  }

  requireGameText(value, fieldName, maxLength) {
    const text = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
    if (!text || Array.from(text).length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new RoomRepositoryError(`${fieldName}需要 1–${maxLength} 个可见字符`, 'GAME_TEXT_INVALID');
    }
    return text;
  }

  normalizeGuess(value) {
    return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase() : '';
  }

  normalizeDrawing(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 120) {
      throw new RoomRepositoryError('请先画几笔，最多支持 120 条笔迹', 'GAME_DRAWING_INVALID');
    }
    let pointCount = 0;
    return input.map((stroke) => {
      if (!stroke || !/^#[0-9a-f]{6}$/i.test(stroke.color) || typeof stroke.width !== 'number' || !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 16 || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > 500) {
        throw new RoomRepositoryError('画笔信息无效，请重新绘制', 'GAME_DRAWING_INVALID');
      }
      pointCount += stroke.points.length;
      if (pointCount > 12000) throw new RoomRepositoryError('画面太复杂了，请简化后再发起', 'GAME_DRAWING_TOO_LARGE');
      return {
        color: stroke.color.toLowerCase(),
        width: stroke.width,
        points: stroke.points.map((point) => {
          if (!point || !['x', 'y'].every((key) => typeof point[key] === 'number' && Number.isFinite(point[key]) && point[key] >= 0 && point[key] <= 1)) {
            throw new RoomRepositoryError('笔迹坐标无效，请重新绘制', 'GAME_DRAWING_INVALID');
          }
          return { x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 };
        })
      };
    });
  }

  requireGameRate(userId, action, interval) {
    const now = Date.now();
    const key = `${action}:${userId}`;
    if (now - (this.gameActivity.get(key) ?? Number.NEGATIVE_INFINITY) < interval) {
      throw new RoomRepositoryError(action === 'guess' ? '慢一点，再想想下一次猜测吧' : '稍等一下，再发起新游戏吧', 'GAME_RATE_LIMITED');
    }
    this.gameActivity.set(key, now);
    if (this.gameActivity.size > 10000) {
      for (const [entry, timestamp] of this.gameActivity) {
        if (now - timestamp > Math.max(GAME_CREATE_INTERVAL_MS, GAME_GUESS_INTERVAL_MS)) this.gameActivity.delete(entry);
      }
    }
  }

  summarizeGame(game) {
    if (game?.kind === 'dice') return `🎲 掷出了 ${game.value} 点`;
    if (game?.kind === 'rps') return game.status === 'waiting' ? '✊ 发起了猜拳挑战' : game.status === 'cancelled' ? '✊ 猜拳已取消' : '✊ 猜拳结果已揭晓';
    if (game?.kind === 'draw') return game.status === 'playing' ? '🎨 来猜猜我画的是什么' : '🎨 你画我猜答案已揭晓';
    return '[小游戏]';
  }

  toPublicMessage(message, user) {
    // Use an allowlist for every response, including history and administrative
    // deletions. Private game choices and stable browser IDs stay on the server.
    const output = {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderKey: message.senderKey,
      senderName: message.senderName,
      ...(message.senderAvatar ? { senderAvatar: message.senderAvatar } : {}),
      type: message.type,
      content: message.type === 'game' ? this.summarizeGame(message.game) : message.content,
      timestamp: message.timestamp
    };
    if (message.attachment) {
      const { url, name, size, mimeType } = message.attachment;
      output.attachment = { url, name, size, mimeType };
    }
    if (message.replyTo) {
      const { id, senderName, content, type } = message.replyTo;
      output.replyTo = { id, senderName, content, type };
    }
    if ((message.type === 'poll' || message.type === 'poll-result') && message.poll) {
      const poll = message.poll;
      output.pollRevision = Number(message.pollRevision) || 0;
      if (message.type === 'poll-result') output.pollSourceId = message.pollSourceId;
      output.poll = {
        question: poll.question,
        options: poll.options.map(({ id, text, count }) => ({ id, text, count })),
        status: poll.status,
        totalVotes: poll.totalVotes,
        ...(poll.deadlineAt !== undefined ? { deadlineAt: poll.deadlineAt } : {}),
        ...(poll.closedAt !== undefined ? { closedAt: poll.closedAt } : {}),
        ...(poll.closeReason ? { closeReason: poll.closeReason } : {})
      };
      const source = message.type === 'poll-result' ? this.getStoredMessage(message.roomId, message.pollSourceId) : message;
      const votes = source?._pollPrivate?.votes;
      if (user?.id && votes && Object.hasOwn(votes, user.id)) output.poll.selectedOptionId = votes[user.id];
    }
    const game = message.game;
    const privateState = message._gamePrivate || {};
    if (message.type === 'game' && game) {
      output.gameRevision = Number(message.gameRevision) || 0;
      if (game.kind === 'dice') output.game = { kind: 'dice', value: game.value };
      if (game.kind === 'rps') {
        output.game = { kind: 'rps', status: game.status };
        if (game.status === 'completed') {
          output.game.hostChoice = privateState.hostChoice;
          if (game.guest) {
            const { userId, publicKey, name, choice } = game.guest;
            output.game.guest = { userId, publicKey, name, choice };
          }
          output.game.winner = game.winner;
        }
      }
      if (game.kind === 'draw') {
        output.game = {
          kind: 'draw', status: game.status, wordLength: game.wordLength,
          strokes: (game.strokes || []).map(({ color, width, points }) => ({ color, width, points: points.map(({ x, y }) => ({ x, y })) })),
          guesses: (game.guesses || []).map(({ userId, publicKey, name, text, correct, timestamp }) => ({ userId, publicKey, name, text, correct, timestamp }))
        };
        if (game.status === 'completed') {
          output.game.answer = privateState.answer;
          if (game.winnerName) output.game.winnerName = game.winnerName;
        }
      }
    }
    return output;
  }

  deleteMessage(roomId, messageId, user, options = {}) {
    const room = options.isAdmin === true ? this.getRoomOrThrow(roomId) : this.requireOwnedRoom(roomId, user);
    const roomMessages = this.messages.get(room.id) || [];
    const messageIndex = roomMessages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) throw new RoomRepositoryError('消息不存在或已被删除', 'MESSAGE_NOT_FOUND');
    const [message] = roomMessages.splice(messageIndex, 1);
    const latestMessage = roomMessages[roomMessages.length - 1];
    this.messages.set(room.id, roomMessages);
    this.rooms.set(room.id, { ...room, lastMessageAt: latestMessage ? new Date(latestMessage.timestamp).toISOString() : null });
    this.deleteStoredAttachment(message);
    this.persist();
    return this.toPublicMessage(message);
  }

  getAdminRooms() {
    return this.sortRooms([...this.rooms.values()]).map((room) => {
      const messages = this.messages.get(room.id) || [];
      const attachments = messages.map((message) => message.attachment).filter(Boolean);
      return {
        ...this.toPublicRoom(room),
        ownerId: room.ownerId,
        messageCount: messages.length,
        attachmentCount: attachments.length,
        attachmentBytes: attachments.reduce((total, attachment) => total + (Number(attachment.size) || 0), 0),
        pendingRequestCount: this.getRoomAccessRecords(room.id).filter((record) => record.status === 'pending').length,
        authorizedMemberCount: this.getRoomAccessRecords(room.id).filter((record) => record.status === 'approved').length
      };
    });
  }

  deleteUserData(profile) {
    const deletedRooms = [];
    const deletedMessages = [];
    const ownerId = profile?.uuid ? `guest-${profile.uuid}` : '';
    let deletedAccessCount = 0;
    for (const room of [...this.rooms.values()]) {
      if (ownerId && room.ownerId === ownerId) {
        deletedRooms.push(this.deleteRoomRecord(room));
        continue;
      }
      const roomMessages = this.messages.get(room.id) || [];
      const retained = [];
      for (const message of roomMessages) {
        if (message.senderKey === profile?.publicKey || message.senderId === profile?.userId) {
          this.deleteStoredAttachment(message);
          deletedMessages.push(message);
        } else {
          retained.push(message);
        }
      }
      if (retained.length === roomMessages.length) continue;
      const latestMessage = retained[retained.length - 1];
      this.messages.set(room.id, retained);
      this.rooms.set(room.id, { ...room, lastMessageAt: latestMessage ? new Date(latestMessage.timestamp).toISOString() : null });
    }
    for (const [key, record] of this.roomAccess) {
      if ((ownerId && record.requesterId === ownerId) || record.requesterPublicKey === profile?.publicKey || record.requesterUserId === profile?.userId) {
        this.roomAccess.delete(key);
        deletedAccessCount += 1;
      }
    }
    if (deletedRooms.length > 0 || deletedMessages.length > 0 || deletedAccessCount > 0) this.persist();
    return { deletedRooms, deletedMessages: deletedMessages.map((message) => this.toPublicMessage(message)), deletedAccessCount };
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

  canViewRoom(room, user, isAdmin = false) {
    return Boolean(room) && (!room.isPrivate || isAdmin || room.ownerId === user?.id || this.hasApprovedAccess(room.id, user?.id));
  }

  hasApprovedAccess(roomId, requesterId) {
    return Boolean(requesterId) && this.roomAccess.get(this.accessKey(roomId, requesterId))?.status === 'approved';
  }

  getRoomAccessRecords(roomId) {
    return [...this.roomAccess.values()]
      .filter((record) => record.roomId === roomId)
      .sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  accessKey(roomId, requesterId) {
    return `${roomId}:${requesterId}`;
  }

  deleteRoomAccessRecords(roomId) {
    for (const [key, record] of this.roomAccess) {
      if (record.roomId === roomId) this.roomAccess.delete(key);
    }
  }

  requireManagedRoom(roomId, actor, isAdmin = false) {
    const room = this.getRoomOrThrow(roomId);
    if (!isAdmin && (room.isFixed || room.ownerId !== actor?.id)) {
      throw new RoomRepositoryError('只有星球创建者或超管可以管理访问权限', 'ROOM_OWNER_REQUIRED');
    }
    return room;
  }

  grantRoomAccessByInvite(room, user) {
    const requester = this.normalizeUser(user);
    const key = this.accessKey(room.id, requester.id);
    const current = this.roomAccess.get(key);
    const now = new Date().toISOString();
    const record = {
      id: current?.id || `access-${randomUUID()}`,
      roomId: room.id,
      requesterId: requester.id,
      requesterUserId: requester.userId,
      requesterPublicKey: requester.publicKey,
      requesterName: requester.name,
      requesterAvatarUrl: requester.avatarUrl,
      status: 'approved',
      source: 'invite',
      attemptCount: Number(current?.attemptCount) || 0,
      createdAt: current?.createdAt || now,
      requestedAt: current?.requestedAt || now,
      decidedAt: now,
      decidedBy: room.ownerId,
      updatedAt: now
    };
    this.roomAccess.set(key, record);
    this.persist();
    return record;
  }

  toPublicAccessRecord(record) {
    return {
      id: record.id,
      roomId: record.roomId,
      requesterId: record.requesterId,
      requesterUserId: record.requesterUserId,
      requesterName: record.requesterName,
      requesterAvatarUrl: record.requesterAvatarUrl || '',
      status: record.status,
      source: record.source,
      attemptCount: Number(record.attemptCount) || 0,
      createdAt: record.createdAt,
      requestedAt: record.requestedAt,
      decidedAt: record.decidedAt || null,
      updatedAt: record.updatedAt
    };
  }

  normalizeStoredAccess(input, profile) {
    if (!['pending', 'approved', 'rejected', 'revoked'].includes(input?.status)) return null;
    const requester = profile
      ? {
          id: input.requesterId,
          userId: profile.userId,
          publicKey: profile.publicKey,
          name: profile.name,
          avatarUrl: profile.avatarUrl || ''
        }
      : {
          id: input.requesterId,
          userId: input.requesterUserId,
          publicKey: input.requesterPublicKey,
          name: input.requesterName,
          avatarUrl: input.requesterAvatarUrl || ''
        };
    try {
      const normalized = this.normalizeUser(requester);
      const now = new Date().toISOString();
      return {
        id: typeof input.id === 'string' && input.id ? input.id : `access-${randomUUID()}`,
        roomId: input.roomId,
        requesterId: normalized.id,
        requesterUserId: normalized.userId,
        requesterPublicKey: normalized.publicKey,
        requesterName: normalized.name,
        requesterAvatarUrl: normalized.avatarUrl,
        status: input.status,
        source: input.source === 'invite' ? 'invite' : 'request',
        attemptCount: input.status === 'revoked' ? 0 : Math.max(0, Math.min(ROOM_ACCESS_MAX_ATTEMPTS, Number(input.attemptCount) || 0)),
        createdAt: input.createdAt || now,
        requestedAt: input.requestedAt || input.createdAt || now,
        ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
        updatedAt: input.updatedAt || input.requestedAt || input.createdAt || now
      };
    } catch {
      return null;
    }
  }

  resolveAccessProfile(record) {
    if (!this.resolveProfile) return null;
    const uuid = /^guest-([0-9a-f-]{36})$/i.exec(record?.requesterId || '')?.[1] || '';
    if (uuid) return this.resolveProfile({ uuid, publicKey: '', userId: '' });
    if (record?.requesterPublicKey) return this.resolveProfile({ uuid: '', publicKey: record.requesterPublicKey, userId: '' });
    if (record?.requesterUserId) return this.resolveProfile({ uuid: '', publicKey: '', userId: record.requesterUserId });
    return null;
  }

  generateInviteToken() {
    return randomBytes(24).toString('base64url');
  }

  isInviteToken(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
  }

  isValidInviteToken(room, candidate) {
    if (!this.isInviteToken(room?.inviteToken) || !this.isInviteToken(candidate)) return false;
    const actual = Buffer.from(candidate);
    const expected = Buffer.from(room.inviteToken);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
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

  getRoomOrThrow(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRepositoryError('星球不存在', 'ROOM_NOT_FOUND');
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
    const snapshot = JSON.stringify(
      {
        version: CHAT_DATA_VERSION,
        rooms: this.sortRooms([...this.rooms.values()]),
        messages: [...this.messages.values()].flat(),
        roomAccess: [...this.roomAccess.values()]
      },
      null,
      2
    );
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

module.exports = { CHAT_DATA_VERSION, ROOM_ACCESS_MAX_ATTEMPTS, RoomRepository, RoomRepositoryError };
