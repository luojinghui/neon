const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { RoomRepository, RoomRepositoryError } = require('./roomRepository');
const { MomentRepository } = require('../moment/momentRepository');

const profiles = [
  { uuid: '11111111-1111-4111-8111-111111111111', userId: 'HostOne', publicKey: 'host-public', name: '小鱼', avatarUrl: '' },
  { uuid: '22222222-2222-4222-8222-222222222222', userId: 'GuestOne', publicKey: 'guest-public', name: '阿橘', avatarUrl: '' }
];

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-presence-'));
  const moments = new MomentRepository({ dataFile: path.join(directory, 'moments.json'), uploadDirectory: path.join(directory, 'moments') });
  let repository;
  const sockets = [];
  const server = http.createServer();
  const io = new Server(server, { transports: ['websocket'] });
  const controllerFile = path.join(__dirname, '..', 'controller', 'chatController.js');
  const controllerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(controllerFile, 'utf8'), {
    module: controllerModule,
    exports: controllerModule.exports,
    require(name) {
      if (name === '../webrtc/callSignaling') return require('../webrtc/callSignaling');
      if (name === '../chat/roomRepository') {
        return {
          RoomRepositoryError,
          RoomRepository: class extends RoomRepository {
            constructor(config) {
              super({ ...config, dataFile: path.join(directory, 'chat.json'), uploadDirectory: path.join(directory, 'uploads') });
              repository = this;
            }
          }
        };
      }
      if (name === '../user/profileRepository') {
        return {
          profileRepository: {
            getByUuid: (uuid) => profiles.find((profile) => profile.uuid === uuid),
            getByPublicKey: (key) => profiles.find((profile) => profile.publicKey === key),
            getByUserId: (userId) => profiles.find((profile) => profile.userId === userId)
          }
        };
      }
      if (name === '../moment/momentRepository') return { momentRepository: moments };
      if (name === '../chat/momentShare') return require('./momentShare');
      throw new Error(`Unexpected controller dependency: ${name}`);
    },
    Error, setTimeout, clearTimeout, setInterval, clearInterval, console
  }, { filename: controllerFile });
  io.on('connection', (socket) => controllerModule.exports.onSocket(socket, io));
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await repository.writeQueue;
    await moments.writeQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  async function connect(profile) {
    const socket = createClient(`http://127.0.0.1:${server.address().port}`, {
      transports: ['websocket'],
      auth: { user: { uuid: profile.uuid } },
      forceNew: true,
      reconnection: false
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }

  return { connect, moments, repository };
}

function request(socket, event, payload) {
  return payload === undefined ? socket.timeout(2000).emitWithAck(event) : socket.timeout(2000).emitWithAck(event, payload);
}

async function accepted(socket, event, payload) {
  const response = await request(socket, event, payload);
  assert.equal(response.ok, true, `${event}: ${response.code || ''} ${response.error || ''}`);
  return response.data;
}

async function rejected(socket, event, payload, code) {
  const response = await request(socket, event, payload);
  assert.equal(response.ok, false, event);
  assert.equal(response.code, code, response.error);
}

test('在线的人出现在星球上，轻戳不进消息流，分享按先后写进星河', { timeout: 15000 }, async (t) => {
  const { connect, moments, repository } = await fixture(t);
  const host = await connect(profiles[0]);
  const guest = await connect(profiles[1]);
  const room = await accepted(host, 'rooms:create', { name: '夜谈', description: '', tags: [], isPrivate: false, passwordEnabled: false });
  await accepted(host, 'room:join', { roomId: room.id });

  const listed = await accepted(guest, 'rooms:list');
  const preview = listed.find((item) => item.id === room.id);
  assert.equal(preview.onlineCount, 1);
  assert.deepEqual(preview.onlineUsers.map((person) => person.userId), ['HostOne']);
  assert.equal(JSON.stringify(preview.onlineUsers).includes(profiles[0].uuid), false);

  const poked = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('没有收到轻戳')), 2000);
    host.on('room:poked', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
  await accepted(guest, 'room:poke', { roomId: room.id, targetUserId: 'HostOne' });
  const event = await poked;
  assert.equal(event.roomId, room.id);
  assert.equal(event.from.name, '阿橘');
  assert.equal(JSON.stringify(event).includes(profiles[1].uuid), false);
  assert.equal(repository.getHistory(room.id, { limit: 20, user: { id: profiles[0].id, userId: 'HostOne', publicKey: 'host-public', name: '小鱼' } }).messages.length, 0);

  await rejected(guest, 'room:poke', { roomId: room.id, targetUserId: 'GuestOne' }, 'POKE_SELF');
  await rejected(guest, 'room:poke', { roomId: room.id, targetUserId: 'Nobody' }, 'POKE_OFFLINE');
  await rejected(guest, 'room:poke', { roomId: room.id, targetUserId: 'HostOne' }, 'POKE_RATE_LIMITED');
  await rejected(guest, 'room:share-moment', { roomId: room.id, messageIds: ['missing'] }, 'ROOM_JOIN_REQUIRED');

  const first = await accepted(host, 'chat:send', { roomId: room.id, type: 'text', content: '先说的' });
  const second = await accepted(host, 'chat:send', { roomId: room.id, type: 'text', content: '后说的' });
  const shared = await accepted(host, 'room:share-moment', { roomId: room.id, messageIds: [second.id, first.id] });
  assert.equal(shared.path, `/moments/${shared.momentId}`);
  const moment = moments.getMoment(shared.momentId);
  assert.equal(moment.text, '先说的\n后说的');
  assert.equal(repository.getHistory(room.id, { limit: 20, user: { id: `guest-${profiles[0].uuid}`, userId: 'HostOne', publicKey: 'host-public', name: '小鱼' } }).messages.length, 2);
});
