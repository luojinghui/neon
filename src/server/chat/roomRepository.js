const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_ROOMS = [
  {
    id: 'soul-harbor',
    name: '灵魂港湾',
    description: '一个不赶时间的角落，聊聊今天的心情和此刻的想法。',
    tags: ['日常', '倾听', '治愈'],
    isFixed: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'starlight-camp',
    name: '星光露营地',
    description: '分享在路上的故事、喜欢的音乐，以及那些偶然遇见的微光。',
    tags: ['故事', '音乐', '旅行'],
    isFixed: true,
    createdAt: '2026-01-01T00:01:00.000Z'
  },
  {
    id: 'inspiration-orbit',
    name: '灵感轨道',
    description: '让未成形的点子先在这里相遇，一起讨论创作、科技和未来。',
    tags: ['灵感', '创作', '科技'],
    isFixed: true,
    createdAt: '2026-01-01T00:02:00.000Z'
  }
];

const DEFAULT_MESSAGES = DEFAULT_ROOMS.map((room, index) => ({
  id: `welcome-${room.id}`,
  roomId: room.id,
  senderId: 'planet-guide',
  senderName: '星球向导',
  type: 'text',
  content: [
    '欢迎来到灵魂港湾。放慢一点，从一句此刻的心情开始吧。',
    '今晚的营火已经点亮，欢迎分享你最近收藏的一首歌或一段旅程。',
    '灵感已进入轨道。把你的半成品想法丢进来，也许会收到意外的回声。'
  ][index],
  timestamp: Date.parse(room.createdAt) + 10_000
}));

class RoomRepository {
  constructor() {
    this.dataFile = process.env.SOUL_CHAT_DATA_FILE || path.join(process.cwd(), '.data', 'soul-chat.json');
    this.rooms = new Map(DEFAULT_ROOMS.map((room) => [room.id, room]));
    this.messages = new Map(DEFAULT_ROOMS.map((room) => [room.id, DEFAULT_MESSAGES.filter((message) => message.roomId === room.id)]));
    this.writeQueue = Promise.resolve();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      for (const room of Array.isArray(data.rooms) ? data.rooms : []) {
        if (room && room.id) this.rooms.set(room.id, room);
      }
      for (const message of Array.isArray(data.messages) ? data.messages : []) {
        if (!message || !this.rooms.has(message.roomId)) continue;
        const roomMessages = this.messages.get(message.roomId) || [];
        if (!roomMessages.some((item) => item.id === message.id)) roomMessages.push(message);
        this.messages.set(message.roomId, roomMessages);
      }
    } catch (error) {
      console.error('Soul chat data could not be loaded:', error.message);
    }
  }

  listRooms() {
    return [...this.rooms.values()].sort((a, b) => {
      if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
      if (a.isFixed) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      const activityDiff = new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime();
      return activityDiff || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  createRoom(input) {
    const name = this.requireText(input.name, '房间名', 32);
    const description = this.optionalText(input.description, 200);
    const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => this.optionalText(tag, 12)).filter(Boolean))].slice(0, 5);
    const room = {
      id: `room-${randomUUID()}`,
      name,
      description,
      tags,
      isFixed: false,
      createdAt: new Date().toISOString(),
      lastMessageAt: null
    };

    this.rooms.set(room.id, room);
    this.messages.set(room.id, []);
    this.persist();
    return room;
  }

  getHistory(roomId, options = {}) {
    if (!this.rooms.has(roomId)) throw new Error('聊天室不存在');
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 50));
    const before = Number(options.before) || Number.POSITIVE_INFINITY;
    const all = (this.messages.get(roomId) || []).filter((message) => message.timestamp < before).sort((a, b) => a.timestamp - b.timestamp);
    const page = all.slice(-limit);

    return { messages: page, hasMore: all.length > page.length, before: page.length > 0 ? page[0].timestamp : null };
  }

  addMessage(roomId, user, input) {
    if (!this.rooms.has(roomId)) throw new Error('聊天室不存在');
    const type = ['text', 'image', 'gif', 'file'].includes(input?.type) ? input.type : 'text';
    const content = type === 'text' ? this.requireText(input?.content, '消息', 4000) : this.optionalText(input?.content, 4000);
    const attachment = type === 'text' ? undefined : this.normalizeAttachment(input?.attachment, type);
    const message = {
      id: `msg-${randomUUID()}`,
      roomId,
      senderId: user.id,
      senderName: user.name,
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
      id: this.requireText(input?.id, '用户 ID', 80),
      name: this.requireText(input?.name, '用户名', 32)
    };
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
    const snapshot = JSON.stringify({ rooms: this.listRooms(), messages: [...this.messages.values()].flat() }, null, 2);
    const tempFile = `${this.dataFile}.tmp`;
    this.writeQueue = this.writeQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(this.dataFile), { recursive: true });
        await fs.promises.writeFile(tempFile, snapshot, 'utf8');
        await fs.promises.rename(tempFile, this.dataFile);
      })
      .catch((error) => console.error('Soul chat data could not be saved:', error.message));
  }
}

module.exports = { RoomRepository };
