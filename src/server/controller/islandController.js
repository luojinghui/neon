const { islandRepository, IslandRepositoryError } = require('../island/islandRepository');
const { profileRepository } = require('../user/profileRepository');

const ONLINE_COUNT_KEY = Symbol.for('neon.island.onlineCount.v1');
const EVICT_MEMBER_KEY = Symbol.for('neon.island.evictMember.v1');

const CURSOR_PALETTE = [
  '#FF6B6B',
  '#FF922B',
  '#51CF66',
  '#22B8CF',
  '#5C7CFA',
  '#CC5DE8',
  '#F06595',
  '#20C997',
  '#FAB005',
  '#845EF7',
  '#339AF0',
  '#FF8787'
];

const islandRooms = new Map();
let activeIo = null;

function roomChannel(islandId) {
  return `island:${islandId}`;
}

function pickColor(publicKey, room = null) {
  const text = String(publicKey || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const preferredIndex = hash % CURSOR_PALETTE.length;
  if (!room) return CURSOR_PALETTE[preferredIndex];

  const usedColors = new Set();
  for (const entry of room.values()) {
    if (entry.publicKey === publicKey && entry.color) {
      return entry.color;
    }
    if (entry.color) {
      usedColors.add(entry.color);
    }
  }

  for (let offset = 0; offset < CURSOR_PALETTE.length; offset += 1) {
    const candidate = CURSOR_PALETTE[(preferredIndex + offset) % CURSOR_PALETTE.length];
    if (!usedColors.has(candidate)) return candidate;
  }
  return CURSOR_PALETTE[preferredIndex];
}

function isSuperAdmin(socket) {
  return socket.data.admin?.role === 'super_admin';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveSocketProfile(socket) {
  const rawUuid =
    typeof socket.handshake.auth?.user?.uuid === 'string'
      ? socket.handshake.auth.user.uuid
      : typeof socket.handshake.auth?.uuid === 'string'
        ? socket.handshake.auth.uuid
        : '';
  const uuid = rawUuid.trim().toLowerCase();
  if (uuid && UUID_PATTERN.test(uuid)) {
    const profile = profileRepository.getByUuid(uuid);
    if (profile) return profile;
    try {
      return profileRepository.ensureProfile({ uuid });
    } catch {
      // fall through
    }
  }
  if (isSuperAdmin(socket)) {
    return {
      uuid: '',
      publicKey: `admin-${socket.data.admin.id || socket.id}`,
      userId: socket.data.admin.username || 'admin',
      name: socket.data.admin.displayName || '管理员',
      avatarUrl: ''
    };
  }
  return null;
}

function requireSocketProfile(socket) {
  const profile = resolveSocketProfile(socket);
  if (!profile) {
    throw new IslandRepositoryError('个人资料不存在，请刷新页面重试', 'PROFILE_NOT_FOUND');
  }
  return profile;
}

function getOnlineUsers(islandId) {
  const room = islandRooms.get(islandId);
  if (!room) return [];
  return [...room.values()].map((entry) => ({ ...entry }));
}

function getOnlineCount(islandId) {
  return islandRooms.get(islandId)?.size || 0;
}

function emitPresence(io, islandId) {
  io.to(roomChannel(islandId)).emit('island:presence', {
    islandId,
    onlineUsers: getOnlineUsers(islandId)
  });
}

function leaveIslandRoom(socket, io, targetIslandId = null) {
  const islandId = targetIslandId || socket.data.islandId;
  if (!islandId) return;
  socket.leave(roomChannel(islandId));
  const room = islandRooms.get(islandId);
  if (room) {
    room.delete(socket.id);
    if (room.size === 0) islandRooms.delete(islandId);
  }
  if (socket.data.islandId === islandId) {
    socket.data.islandId = null;
  }
  emitPresence(io, islandId);
}

function evictMember(io, islandId, publicKey) {
  const serverIo = io || activeIo;
  if (!serverIo || !islandId || !publicKey) return;
  const room = islandRooms.get(islandId);
  if (!room) return;
  let changed = false;
  for (const [socketId, entry] of [...room.entries()]) {
    if (entry.publicKey !== publicKey) continue;
    const targetSocket = serverIo.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.emit('island:kicked', { islandId });
      targetSocket.leave(roomChannel(islandId));
      if (targetSocket.data.islandId === islandId) {
        targetSocket.data.islandId = null;
      }
    }
    room.delete(socketId);
    changed = true;
  }
  if (room.size === 0) islandRooms.delete(islandId);
  if (changed) emitPresence(serverIo, islandId);
}

function broadcastItemDeleted(io, islandId, itemId) {
  const serverIo = io || activeIo;
  if (!serverIo || !islandId || !itemId) return;
  serverIo.to(roomChannel(islandId)).emit('island:item:deleted', { islandId, itemId });
}

async function respondAsync(ack, action) {
  try {
    const data = await action();
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (error) {
    if (typeof ack === 'function') {
      ack({
        ok: false,
        error: error instanceof Error ? error.message : '请求失败',
        ...(error?.code ? { code: error.code } : {})
      });
    }
  }
}

function requireJoinedIsland(socket, islandId) {
  const id = String(islandId || '').trim();
  const profile = requireSocketProfile(socket);
  if (!id || socket.data.islandId !== id || !islandRooms.get(id)?.has(socket.id)) {
    throw new IslandRepositoryError('请先进入浮岛', 'ISLAND_JOIN_REQUIRED');
  }
  const island = islandRepository.getIslandById(id);
  if (!island || !islandRepository.canAccessIsland(island, profile, { isAdmin: isSuperAdmin(socket) })) {
    throw new IslandRepositoryError('当前浮岛访问权限已失效', 'ISLAND_FORBIDDEN');
  }
  return { profile, island };
}

function onSocket(socket, io) {
  activeIo = io;
  globalThis[ONLINE_COUNT_KEY] = getOnlineCount;
  globalThis[EVICT_MEMBER_KEY] = (islandId, publicKey) => evictMember(io, islandId, publicKey);

  socket.on('island:join', (payload, ack) => {
    void respondAsync(ack, async () => {
      const profile = requireSocketProfile(socket);
      const admin = isSuperAdmin(socket);
      const islandId = String(payload?.islandId || '').trim();
      const island = islandRepository.getIslandById(islandId);
      if (!island) {
        throw new IslandRepositoryError('浮岛不存在', 'ISLAND_NOT_FOUND');
      }
      if (!islandRepository.canAccessIsland(island, profile, { isAdmin: admin })) {
        throw new IslandRepositoryError('没有访问该浮岛的权限', 'ISLAND_FORBIDDEN');
      }

      if (socket.data.islandId && socket.data.islandId !== island.id) {
        leaveIslandRoom(socket, io);
      }

      socket.join(roomChannel(island.id));
      socket.data.islandId = island.id;

      let room = islandRooms.get(island.id);
      if (!room) {
        room = new Map();
        islandRooms.set(island.id, room);
      }
      room.set(socket.id, {
        socketId: socket.id,
        publicKey: profile.publicKey,
        userId: profile.userId || '',
        name: profile.name || '浮岛旅人',
        avatarUrl: profile.avatarUrl || '',
        color: pickColor(profile.publicKey, room),
        cursor: null,
        lockedItemId: null,
        focusedItemId: null,
        viewportCenter: null
      });

      if (island.members?.[profile.publicKey]) {
        await islandRepository.touchVisit(island.id, profile);
      }

      const onlineUsers = getOnlineUsers(island.id);
      const detail = islandRepository.presentDetail(island, profile, {
        isAdmin: admin,
        onlineCount: onlineUsers.length
      });

      emitPresence(io, island.id);
      return {
        island: detail,
        items: detail.items,
        onlineUsers
      };
    });
  });

  socket.on('island:leave', (payload) => {
    const islandId = typeof payload?.islandId === 'string' && payload.islandId.trim()
      ? payload.islandId.trim()
      : socket.data.islandId;
    if (islandId) leaveIslandRoom(socket, io, islandId);
  });

  socket.on('island:cursor', (payload) => {
    try {
      const islandId = String(payload?.islandId || socket.data.islandId || '').trim();
      if (!islandId || socket.data.islandId !== islandId) return;
      const room = islandRooms.get(islandId);
      const entry = room?.get(socket.id);
      if (!entry) return;
      const x = Number(payload?.x);
      const y = Number(payload?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      entry.cursor = { x, y };
      if (payload?.viewportCenter && Number.isFinite(Number(payload.viewportCenter.x)) && Number.isFinite(Number(payload.viewportCenter.y))) {
        entry.viewportCenter = {
          x: Number(payload.viewportCenter.x),
          y: Number(payload.viewportCenter.y)
        };
      }

      socket.to(roomChannel(islandId)).emit('island:cursor', {
        islandId,
        socketId: socket.id,
        publicKey: entry.publicKey,
        name: entry.name,
        color: entry.color,
        x,
        y,
        ...(entry.viewportCenter ? { viewportCenter: entry.viewportCenter } : {})
      });
    } catch {
      // Ignore malformed cursor packets.
    }
  });

  socket.on('island:item:lock', (payload) => {
    try {
      const islandId = String(payload?.islandId || socket.data.islandId || '').trim();
      if (!islandId || socket.data.islandId !== islandId) return;
      const room = islandRooms.get(islandId);
      const entry = room?.get(socket.id);
      if (!entry) return;
      entry.lockedItemId = payload?.itemId ? String(payload.itemId).trim() : null;
      emitPresence(io, islandId);
    } catch {
      // Ignore malformed lock packets.
    }
  });

  socket.on('island:item:focus', (payload) => {
    try {
      const islandId = String(payload?.islandId || socket.data.islandId || '').trim();
      if (!islandId || socket.data.islandId !== islandId) return;
      const room = islandRooms.get(islandId);
      const entry = room?.get(socket.id);
      if (!entry) return;
      const nextItemId = payload?.itemId ? String(payload.itemId).trim() : null;
      if (entry.focusedItemId === nextItemId) return;
      entry.focusedItemId = nextItemId;
      emitPresence(io, islandId);
    } catch {
      // Ignore malformed focus packets.
    }
  });

  socket.on('island:item:upsert', (payload, ack) => {
    void respondAsync(ack, async () => {
      const { profile, island } = requireJoinedIsland(socket, payload?.islandId);
      const item = await islandRepository.upsertItem(island.id, profile, payload?.item);
      io.to(roomChannel(island.id)).emit('island:item:upserted', {
        islandId: island.id,
        item
      });
      return { item };
    });
  });

  socket.on('island:item:move', (payload, ack) => {
    void respondAsync(ack, async () => {
      const { profile, island } = requireJoinedIsland(socket, payload?.islandId);
      const itemId = String(payload?.itemId || '').trim();
      const target = island.items.find((entry) => entry.id === itemId);
      if (!target) {
        throw new IslandRepositoryError('物件不存在或已被删除', 'ISLAND_ITEM_NOT_FOUND');
      }
      const admin = isSuperAdmin(socket);
      if (!islandRepository.canArrangeItem(island, profile, { isAdmin: admin })) {
        throw new IslandRepositoryError('没有操作该浮岛物件的权限', 'ISLAND_ITEM_FORBIDDEN');
      }

      const x = Number(payload?.x);
      const y = Number(payload?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new IslandRepositoryError('坐标无效', 'ISLAND_ITEM_INVALID');
      }

      const broadcastPayload = {
        islandId: island.id,
        itemId,
        x,
        y,
        ...(payload?.w !== undefined ? { w: Number(payload.w) } : {}),
        ...(payload?.h !== undefined ? { h: Number(payload.h) } : {}),
        ...(payload?.rotation !== undefined ? { rotation: Number(payload.rotation) } : {}),
        ...(payload?.zIndex !== undefined ? { zIndex: Math.round(Number(payload.zIndex)) } : {}),
        socketId: socket.id
      };

      socket.to(roomChannel(island.id)).emit('island:item:moved', broadcastPayload);

      if (payload?.persist === true) {
        const updated = await islandRepository.moveItem(island.id, profile, payload, { isAdmin: admin });
        return { item: updated };
      }
      return { item: null };
    });
  });

  socket.on('island:item:delete', (payload, ack) => {
    void respondAsync(ack, async () => {
      const { profile, island } = requireJoinedIsland(socket, payload?.islandId);
      const deleted = await islandRepository.deleteItem(island.id, profile, payload?.itemId, {
        isAdmin: isSuperAdmin(socket)
      });
      const room = islandRooms.get(island.id);
      let presenceChanged = false;
      if (room) {
        for (const entry of room.values()) {
          if (entry.lockedItemId === deleted.id) {
            entry.lockedItemId = null;
            presenceChanged = true;
          }
          if (entry.focusedItemId === deleted.id) {
            entry.focusedItemId = null;
            presenceChanged = true;
          }
        }
      }
      io.to(roomChannel(island.id)).emit('island:item:deleted', {
        islandId: island.id,
        itemId: deleted.id
      });
      if (presenceChanged) emitPresence(io, island.id);
      return { itemId: deleted.id };
    });
  });

  socket.on('disconnect', () => {
    leaveIslandRoom(socket, io);
  });
}

module.exports = {
  broadcastItemDeleted,
  evictMember,
  getOnlineCount,
  getOnlineUsers,
  onSocket
};
