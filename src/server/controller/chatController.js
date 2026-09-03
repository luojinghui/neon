const { RoomRepository } = require('../chat/roomRepository');
const { profileRepository } = require('../user/profileRepository');

const repository = new RoomRepository({
  resolveProfile({ uuid, publicKey, userId }) {
    if (uuid) return profileRepository.getByUuid(uuid);
    if (publicKey) return profileRepository.getByPublicKey(publicKey);
    if (userId) return profileRepository.getByUserId(userId);
    return null;
  }
});
const roomMembers = new Map();

function normalizeSocketUser(input) {
  const uuid = typeof input?.uuid === 'string' ? input.uuid.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) throw new Error('浏览器身份无效，请刷新页面重试');
  const profile = profileRepository.getByUuid(uuid);
  if (!profile) throw new Error('个人资料不存在，请刷新页面重试');
  return {
    id: `guest-${uuid}`,
    userId: profile.userId,
    publicKey: profile.publicKey,
    name: profile.name,
    avatarUrl: profile.avatarUrl
  };
}

function respond(ack, action) {
  try {
    const data = action();
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (error) {
    if (typeof ack === 'function') {
      ack({
        ok: false,
        error: error instanceof Error ? error.message : '请求失败',
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.data ? { data: error.data } : {})
      });
    }
  }
}

function requireUser(socket) {
  if (!socket.data.user) throw new Error(socket.data.identityError || '用户身份无效，请刷新页面重试');
  return socket.data.user;
}

function isSuperAdmin(socket) {
  return socket.data.admin?.role === 'super_admin';
}

function getRoomOwner(room) {
  const ownerUuid = /^guest-([0-9a-f-]{36})$/i.exec(room?.ownerId || '')?.[1] || '';
  const owner = ownerUuid ? profileRepository.getByUuid(ownerUuid) : null;
  return owner
    ? { userId: owner.userId, name: owner.name, avatarUrl: owner.avatarUrl || '' }
    : { userId: '', name: room?.ownerId === 'planet-system' ? '星球系统' : '未知人员', avatarUrl: '' };
}

function getMembership(room, user, admin = false) {
  if (admin) return 'admin';
  if (!room.isPrivate) return 'public';
  if (room.ownerId === user?.id) return 'owner';
  if (repository.hasApprovedAccess(room.id, user?.id)) return 'approved';
  return 'none';
}

function presentRoom(room, user, admin = false) {
  const isCreator = !room.isFixed && room.ownerId === user?.id;
  return {
    ...repository.toPublicRoom(room),
    onlineCount: roomMembers.get(room.id)?.size || 0,
    status: 'online',
    isOwner: admin || isCreator,
    isCreator,
    membership: getMembership(room, user, admin),
    owner: getRoomOwner(room),
    pendingRequestCount: isCreator || admin ? repository.getRoomAccessRecords(room.id).filter((record) => record.status === 'pending').length : 0
  };
}

function presentRoomPreview(room, user) {
  const presented = repository.toPublicRoom(room);
  delete presented.lastMessageAt;
  delete presented.updatedAt;
  return {
    ...presented,
    status: 'online',
    isOwner: false,
    isCreator: false,
    membership: 'none',
    owner: getRoomOwner(room),
    pendingRequestCount: 0,
    access: repository.getRoomAccessState(room.id, user)
  };
}

function getRooms(user, admin = false) {
  return repository.listRooms(user, { isAdmin: admin }).map((room) => presentRoom(room, user, admin));
}

function broadcastRoomsChanged(io) {
  io.emit('rooms:changed');
}

function emitToUser(io, userId, event, payload) {
  for (const targetSocket of io.sockets.sockets.values()) {
    if (targetSocket.data.user?.id === userId) targetSocket.emit(event, payload);
  }
}

function notifyRoomAccessChanged(io, room, requesterId, requested = false) {
  const access = repository.getRoomAccessState(room.id, { id: requesterId });
  const pendingRequestCount = repository.getRoomAccessRecords(room.id).filter((record) => record.status === 'pending').length;
  emitToUser(io, room.ownerId, requested ? 'room:access:requested' : 'room:access:changed', { roomId: room.id, pendingRequestCount });
  emitToUser(io, requesterId, 'room:access:changed', { roomId: room.id, access });
  broadcastRoomsChanged(io);
}

function evictRoomUser(io, roomId, userId) {
  const members = roomMembers.get(roomId);
  for (const targetSocket of io.sockets.sockets.values()) {
    if (targetSocket.data.user?.id !== userId || targetSocket.data.roomId !== roomId) continue;
    targetSocket.leave(roomId);
    targetSocket.data.roomId = null;
    members?.delete(targetSocket.id);
  }
  if (members?.size === 0) roomMembers.delete(roomId);
}

function broadcastRoomUpdated(io, room) {
  const members = roomMembers.get(room.id) || new Set();
  for (const socketId of members) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (!memberSocket) continue;
    const admin = isSuperAdmin(memberSocket);
    if (!repository.canViewRoom(room, memberSocket.data.user, admin)) {
      memberSocket.leave(room.id);
      memberSocket.data.roomId = null;
      members.delete(socketId);
      memberSocket.emit('room:access:changed', {
        roomId: room.id,
        access: repository.getRoomAccessState(room.id, memberSocket.data.user)
      });
      continue;
    }
    memberSocket.emit('room:updated', presentRoom(room, memberSocket.data.user, admin));
  }
  if (members.size === 0) roomMembers.delete(room.id);
}

function leaveCurrentRoom(socket, io) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  socket.leave(roomId);
  const members = roomMembers.get(roomId);
  members?.delete(socket.id);
  if (members?.size === 0) roomMembers.delete(roomId);
  socket.data.roomId = null;
  broadcastRoomsChanged(io);
}

function removeDeletedRoomMembers(roomId, io) {
  const members = roomMembers.get(roomId) || new Set();
  for (const socketId of members) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (!memberSocket) continue;
    memberSocket.leave(roomId);
    memberSocket.data.roomId = null;
  }
  roomMembers.delete(roomId);
}

const onSocket = (socket, io) => {
  try {
    socket.data.user = repository.normalizeUser(normalizeSocketUser(socket.handshake.auth?.user));
  } catch (error) {
    socket.data.user = null;
    socket.data.identityError = error instanceof Error ? error.message : '用户身份无效';
  }

  socket.on('rooms:list', (ack) => respond(ack, () => getRooms(requireUser(socket), isSuperAdmin(socket))));

  socket.on('rooms:search', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const admin = isSuperAdmin(socket);
      const room = repository.searchRoom(payload?.query);
      if (!room) return null;
      return repository.canViewRoom(room, user, admin) ? presentRoom(room, user, admin) : presentRoomPreview(room, user);
    });
  });

  socket.on('rooms:create', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.createRoom(payload || {}, user);
      broadcastRoomsChanged(io);
      return presentRoom(room, user, isSuperAdmin(socket));
    });
  });

  socket.on('rooms:update', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = isSuperAdmin(socket)
        ? repository.updateRoomAsAdmin(payload?.roomId, payload || {})
        : repository.updateRoom(payload?.roomId, payload || {}, user);
      broadcastRoomUpdated(io, room);
      broadcastRoomsChanged(io);
      return presentRoom(room, user, isSuperAdmin(socket));
    });
  });

  socket.on('rooms:delete', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = isSuperAdmin(socket) ? repository.deleteRoomAsAdmin(payload?.roomId) : repository.deleteRoom(payload?.roomId, user);
      io.to(room.id).emit('room:deleted', { roomId: room.id });
      removeDeletedRoomMembers(room.id, io);
      broadcastRoomsChanged(io);
      return { roomId: room.id };
    });
  });

  socket.on('room:join', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const admin = isSuperAdmin(socket);
      const existingRoom = repository.getRoom(payload?.roomId);
      const hadAccess = repository.canViewRoom(existingRoom, user, admin);
      let room;
      try {
        room = repository.verifyRoomAccess(payload?.roomId, payload?.password, {
          user,
          isAdmin: admin,
          inviteToken: payload?.inviteToken
        });
      } catch (error) {
        if (error?.code?.startsWith('ROOM_ACCESS_') && existingRoom) {
          error.data = { ...(error.data || {}), room: presentRoomPreview(existingRoom, user) };
        }
        throw error;
      }
      if (room.isPrivate && !hadAccess && repository.canViewRoom(room, user, admin)) {
        notifyRoomAccessChanged(io, room, user.id);
      }

      leaveCurrentRoom(socket, io);
      socket.join(room.id);
      socket.data.roomId = room.id;
      const members = roomMembers.get(room.id) || new Set();
      members.add(socket.id);
      roomMembers.set(room.id, members);
      const history = repository.getHistory(room.id, { limit: 50 });
      broadcastRoomsChanged(io);

      return { room: presentRoom(room, user, admin), ...history };
    });
  });

  socket.on('room:access:request', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const record = repository.requestRoomAccess(payload?.roomId, user);
      const room = repository.getRoom(record.roomId);
      notifyRoomAccessChanged(io, room, record.requesterId, true);
      return { access: repository.getRoomAccessState(room.id, user) };
    });
  });

  socket.on('room:access:list', (payload, ack) => {
    respond(ack, () => repository.getRoomAccessManagement(payload?.roomId, requireUser(socket), { isAdmin: isSuperAdmin(socket) }));
  });

  socket.on('room:access:decide', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const result = repository.decideRoomAccess(payload?.roomId, payload?.requesterId, payload?.decision, user, { isAdmin: isSuperAdmin(socket) });
      notifyRoomAccessChanged(io, result.room, result.record.requesterId);
      return repository.getRoomAccessManagement(result.room.id, user, { isAdmin: isSuperAdmin(socket) });
    });
  });

  socket.on('room:access:revoke', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const result = repository.revokeRoomAccess(payload?.roomId, payload?.requesterId, user, { isAdmin: isSuperAdmin(socket) });
      evictRoomUser(io, result.room.id, result.record.requesterId);
      notifyRoomAccessChanged(io, result.room, result.record.requesterId);
      return repository.getRoomAccessManagement(result.room.id, user, { isAdmin: isSuperAdmin(socket) });
    });
  });

  socket.on('room:invite:rotate', (payload, ack) => {
    respond(ack, () => {
      const roomId = payload?.roomId;
      const inviteToken = repository.rotateInviteToken(roomId, requireUser(socket));
      return { roomId, inviteToken };
    });
  });

  socket.on('room:leave', (ack) => {
    leaveCurrentRoom(socket, io);
    if (typeof ack === 'function') ack({ ok: true, data: null });
  });

  socket.on('chat:history', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入星球');
      return repository.getHistory(payload.roomId, { before: payload?.before, limit: payload?.limit });
    });
  });

  socket.on('chat:send', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入星球');
      const message = repository.addMessage(socket.data.roomId, requireUser(socket), payload);
      io.to(socket.data.roomId).emit('chat:message', message);
      broadcastRoomsChanged(io);
      return message;
    });
  });

  socket.on('chat:delete', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入星球');
      const message = repository.deleteMessage(socket.data.roomId, payload?.messageId, requireUser(socket), { isAdmin: isSuperAdmin(socket) });
      io.to(socket.data.roomId).emit('chat:deleted', { roomId: socket.data.roomId, messageId: message.id });
      broadcastRoomsChanged(io);
      return { roomId: socket.data.roomId, messageId: message.id };
    });
  });

  socket.on('disconnect', () => leaveCurrentRoom(socket, io));
};

function adminListRooms() {
  return repository.getAdminRooms().map((room) => ({ ...room, onlineCount: roomMembers.get(room.id)?.size || 0 }));
}

function adminListRoomAccess() {
  return repository.listAllRoomAccess().map((record) => ({
    ...record,
    roomName: record.room.name,
    roomCode: record.room.code
  }));
}

function adminChangeRoomAccess(roomId, requesterId, action, adminId, io) {
  const options = { isAdmin: true, adminId };
  const result = action === 'revoked'
    ? repository.revokeRoomAccess(roomId, requesterId, null, options)
    : repository.decideRoomAccess(roomId, requesterId, action, null, options);
  if (action === 'revoked') evictRoomUser(io, roomId, requesterId);
  notifyRoomAccessChanged(io, result.room, result.record.requesterId);
  return repository.toPublicAccessRecord(result.record);
}

function adminUpdateRoom(roomId, input, io) {
  const room = repository.updateRoomAsAdmin(roomId, input);
  broadcastRoomUpdated(io, room);
  broadcastRoomsChanged(io);
  return { ...repository.getAdminRooms().find((item) => item.id === room.id), onlineCount: roomMembers.get(room.id)?.size || 0 };
}

function adminDeleteRoom(roomId, io) {
  const room = repository.deleteRoomAsAdmin(roomId);
  io.to(room.id).emit('room:deleted', { roomId: room.id });
  removeDeletedRoomMembers(room.id, io);
  broadcastRoomsChanged(io);
  return room;
}

function adminDeleteUserData(profile, io) {
  const deletedUserId = profile?.uuid ? `guest-${profile.uuid}` : '';
  const result = repository.deleteUserData(profile);
  for (const room of result.deletedRooms) {
    io.to(room.id).emit('room:deleted', { roomId: room.id });
    removeDeletedRoomMembers(room.id, io);
  }
  for (const message of result.deletedMessages) {
    io.to(message.roomId).emit('chat:deleted', { roomId: message.roomId, messageId: message.id });
  }
  if (deletedUserId) {
    for (const roomId of [...roomMembers.keys()]) evictRoomUser(io, roomId, deletedUserId);
  }
  if (result.deletedRooms.length > 0 || result.deletedMessages.length > 0 || result.deletedAccessCount > 0) broadcastRoomsChanged(io);
  return result;
}

module.exports = {
  adminChangeRoomAccess,
  adminDeleteRoom,
  adminDeleteUserData,
  adminListRoomAccess,
  adminListRooms,
  adminUpdateRoom,
  onSocket
};
