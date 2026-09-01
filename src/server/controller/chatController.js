const { RoomRepository } = require('../chat/roomRepository');

const repository = new RoomRepository();
const roomMembers = new Map();

function respond(ack, action) {
  try {
    const data = action();
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (error) {
    if (typeof ack === 'function') ack({ ok: false, error: error instanceof Error ? error.message : '请求失败' });
  }
}

function getRooms() {
  return repository.listRooms().map((room) => ({ ...room, onlineCount: roomMembers.get(room.id)?.size || 0, status: 'online' }));
}

function broadcastRooms(io) {
  io.emit('rooms:changed', getRooms());
}

function leaveCurrentRoom(socket, io) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  socket.leave(roomId);
  const members = roomMembers.get(roomId);
  members?.delete(socket.id);
  if (members?.size === 0) roomMembers.delete(roomId);
  socket.data.roomId = null;
  broadcastRooms(io);
}

const onSocket = (socket, io) => {
  socket.on('rooms:list', (ack) => respond(ack, getRooms));

  socket.on('rooms:create', (payload, ack) => {
    respond(ack, () => {
      const room = repository.createRoom(payload || {});
      broadcastRooms(io);
      return { ...room, onlineCount: 0, status: 'online' };
    });
  });

  socket.on('room:join', (payload, ack) => {
    respond(ack, () => {
      const room = repository.getRoom(payload?.roomId);
      if (!room) throw new Error('聊天室不存在');
      const user = repository.normalizeUser(payload?.user);

      leaveCurrentRoom(socket, io);
      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.user = user;
      const members = roomMembers.get(room.id) || new Set();
      members.add(socket.id);
      roomMembers.set(room.id, members);
      const history = repository.getHistory(room.id, { limit: 50 });
      broadcastRooms(io);

      return { room: { ...room, onlineCount: members.size, status: 'online' }, ...history };
    });
  });

  socket.on('room:leave', (ack) => {
    leaveCurrentRoom(socket, io);
    if (typeof ack === 'function') ack({ ok: true, data: null });
  });

  socket.on('chat:history', (payload, ack) => {
    respond(ack, () => repository.getHistory(payload?.roomId, { before: payload?.before, limit: payload?.limit }));
  });

  socket.on('chat:send', (payload, ack) => {
    respond(ack, () => {
      if (!socket.data.roomId || socket.data.roomId !== payload?.roomId) throw new Error('请先加入聊天室');
      const message = repository.addMessage(socket.data.roomId, socket.data.user, payload);
      io.to(socket.data.roomId).emit('chat:message', message);
      broadcastRooms(io);
      return message;
    });
  });

  socket.on('disconnect', () => leaveCurrentRoom(socket, io));
};

module.exports = { onSocket };
