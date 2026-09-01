const { RoomRepository } = require('../chat/roomRepository');

const repository = new RoomRepository();
const roomMembers = new Map();

function respond(ack, action) {
  try {
    const data = action();
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

function requireUser(socket) {
  if (!socket.data.user) throw new Error(socket.data.identityError || '用户身份无效，请刷新页面重试');
  return socket.data.user;
}

function presentRoom(room, user) {
  return {
    ...repository.toPublicRoom(room),
    onlineCount: roomMembers.get(room.id)?.size || 0,
    status: 'online',
    isOwner: !room.isFixed && room.ownerId === user?.id
  };
}

function getRooms(user) {
  return repository.listRooms(user).map((room) => presentRoom(room, user));
}

function broadcastRoomsChanged(io) {
  io.emit('rooms:changed');
}

function broadcastRoomUpdated(io, room) {
  const members = roomMembers.get(room.id) || new Set();
  for (const socketId of members) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (memberSocket) memberSocket.emit('room:updated', presentRoom(room, memberSocket.data.user));
  }
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
    socket.data.user = repository.normalizeUser(socket.handshake.auth?.user);
  } catch (error) {
    socket.data.user = null;
    socket.data.identityError = error instanceof Error ? error.message : '用户身份无效';
  }

  socket.on('rooms:list', (ack) => respond(ack, () => getRooms(requireUser(socket))));

  socket.on('rooms:search', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.searchRoom(payload?.query);
      return room ? presentRoom(room, user) : null;
    });
  });

  socket.on('rooms:create', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.createRoom(payload || {}, user);
      broadcastRoomsChanged(io);
      return presentRoom(room, user);
    });
  });

  socket.on('rooms:update', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.updateRoom(payload?.roomId, payload || {}, user);
      broadcastRoomUpdated(io, room);
      broadcastRoomsChanged(io);
      return presentRoom(room, user);
    });
  });

  socket.on('rooms:delete', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.deleteRoom(payload?.roomId, user);
      io.to(room.id).emit('room:deleted', { roomId: room.id });
      removeDeletedRoomMembers(room.id, io);
      broadcastRoomsChanged(io);
      return { roomId: room.id };
    });
  });

  socket.on('room:join', (payload, ack) => {
    respond(ack, () => {
      const user = requireUser(socket);
      const room = repository.verifyRoomAccess(payload?.roomId, payload?.password);

      leaveCurrentRoom(socket, io);
      socket.join(room.id);
      socket.data.roomId = room.id;
      const members = roomMembers.get(room.id) || new Set();
      members.add(socket.id);
      roomMembers.set(room.id, members);
      const history = repository.getHistory(room.id, { limit: 50 });
      broadcastRoomsChanged(io);

      return { room: presentRoom(room, user), ...history };
    });
  });

  socket.on('room:leave', (ack) => {
    leaveCurrentRoom(socket, io);
    if (typeof ack === 'function') ack({ ok: true, data: null });
  });

  socket.on('chat:history', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入聊天室');
      return repository.getHistory(payload.roomId, { before: payload?.before, limit: payload?.limit });
    });
  });

  socket.on('chat:send', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入聊天室');
      const message = repository.addMessage(socket.data.roomId, requireUser(socket), payload);
      io.to(socket.data.roomId).emit('chat:message', message);
      broadcastRoomsChanged(io);
      return message;
    });
  });

  socket.on('chat:delete', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入聊天室');
      const message = repository.deleteMessage(socket.data.roomId, payload?.messageId, requireUser(socket));
      io.to(socket.data.roomId).emit('chat:deleted', { roomId: socket.data.roomId, messageId: message.id });
      broadcastRoomsChanged(io);
      return { roomId: socket.data.roomId, messageId: message.id };
    });
  });

  socket.on('disconnect', () => leaveCurrentRoom(socket, io));
};

module.exports = { onSocket };
