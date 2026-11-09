const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { RoomRepository, RoomRepositoryError } = require('./roomRepository');

function createProfiles() {
  return [
    { uuid: '11111111-1111-4111-8111-111111111111', userId: 'GovHost', publicKey: 'gov-host-public', name: '创建者' },
    { uuid: '22222222-2222-4222-8222-222222222222', userId: 'GovGuest', publicKey: 'gov-guest-public', name: '访客' },
    { uuid: '33333333-3333-4333-8333-333333333333', userId: 'GovOther', publicKey: 'gov-other-public', name: '另一位' }
  ];
}
const assertNoPasswordSecrets = () => {};
function waitForEvent(socket, event, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2000);
    function onEvent(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      assertNoPasswordSecrets(payload);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

async function fixture(t, options = {}) {
  const ownsDirectory = !options.directory;
  const directory = options.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'neon-governance-sockets-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const profiles = options.profiles || createProfiles();
  const sockets = [];
  const trustedAdminToken = randomBytes(24).toString('hex');
  let repository;
  let stopped = false;
  const server = http.createServer();
  const io = new Server(server, { transports: ['websocket'] });
  // 仅测试中间件可写受信管理员身份；客户端传来的 role/admin 字段不授予权限。
  io.use((socket, next) => {
    if (socket.handshake.auth?.testAdminToken === trustedAdminToken) socket.data.admin = { role: 'super_admin' };
    next();
  });
  // 加载真实控制器，同时把所有持久化定位到临时目录，不触碰项目 .data。
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
              super({ ...config, dataFile, uploadDirectory: path.join(directory, 'uploads') });
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
      throw new Error(`Unexpected controller dependency: ${name}`);
    },
    Error, setTimeout, clearTimeout, setInterval, clearInterval, console
  }, { filename: controllerFile });
  io.on('connection', (socket) => controllerModule.exports.onSocket(socket, io));

  async function stop() {
    if (stopped) return;
    stopped = true;
    for (const socket of sockets) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await repository.writeQueue;
    await repository.cleanupQueue;
  }
  t.after(async () => {
    try {
      await stop();
      for (const socket of sockets) {
        for (const { payloads } of socket.receivedEvents) {
          for (const payload of payloads) assertNoPasswordSecrets(payload);
        }
      }
    } finally {
      if (ownsDirectory) fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  async function connect(profile = profiles[0], options = {}) {
    const socket = createClient(`http://127.0.0.1:${server.address().port}`, {
      transports: ['websocket'],
      auth: {
        ...options.auth,
        user: { uuid: profile.uuid, ...options.auth?.user },
        ...(options.trustedAdmin ? { testAdminToken: trustedAdminToken } : {})
      },
      reconnection: false,
      forceNew: true,
      autoConnect: false
    });
    sockets.push(socket);
    socket.receivedEvents = [];
    socket.onAny((event, ...payloads) => socket.receivedEvents.push({ event, payloads }));
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }

  return { directory, dataFile, profiles, repository, connect, stop };
}


async function accepted(socket, event, payload) {
  const response = await socket.timeout(2000).emitWithAck(event, payload);
  assert.equal(response.ok, true, `${event}: ${response.code || ''} ${response.error || ''}`);
  return response.data;
}
async function rejected(socket, event, payload, code) {
  const response = await socket.timeout(2000).emitWithAck(event, payload);
  assert.equal(response.ok, false);
  assert.equal(response.code, code);
}
const roomInput = { name: '治理回归', description: '', tags: [], isPrivate: false, passwordEnabled: false };

test('announcement, pin and member events reach online members with correct permissions', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect(profiles[0]);
  const guest = await connect(profiles[1]);
  const room = await accepted(host, 'rooms:create', roomInput);
  await accepted(host, 'room:join', { roomId: room.id });
  await accepted(guest, 'room:join', { roomId: room.id });

  const updated = waitForEvent(guest, 'room:updated', (r) => r.announcement?.text === '欢迎光临');
  await accepted(host, 'room:announcement', { roomId: room.id, text: '欢迎光临' });
  assert.equal((await updated).announcement.text, '欢迎光临');
  await rejected(guest, 'room:announcement', { roomId: room.id, text: 'x' }, 'ROOM_OWNER_REQUIRED');
  await rejected(guest, 'room:rules', { roomId: room.id, text: 'x' }, 'ROOM_OWNER_REQUIRED');

  const message = await accepted(guest, 'chat:send', { roomId: room.id, type: 'text', content: '重要消息' });
  const pinnedUpdate = waitForEvent(guest, 'room:updated', (r) => r.pinnedMessages?.length === 1);
  await accepted(host, 'room:pin', { roomId: room.id, messageId: message.id });
  assert.equal((await pinnedUpdate).pinnedMessages[0].content, '重要消息');
  await rejected(guest, 'room:pin', { roomId: room.id, messageId: message.id }, 'ROOM_OWNER_REQUIRED');
  const unpinned = waitForEvent(guest, 'room:updated', (r) => r.pinnedMessages?.length === 0);
  await accepted(guest, 'chat:recall', { roomId: room.id, messageId: message.id });
  assert.equal((await unpinned).pinnedMessages.length, 0);

  const { members } = await accepted(guest, 'room:members', { roomId: room.id });
  assert.deepEqual(members.map((m) => [m.userId, m.role, m.online]), [['GovHost', 'owner', true], ['GovGuest', 'member', true]]);
});

test('kick removes the member, rejects owner/self/non-managers and bans public re-entry', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect(profiles[0]);
  const guest = await connect(profiles[1]);
  const other = await connect(profiles[2]);
  const room = await accepted(host, 'rooms:create', roomInput);
  for (const socket of [host, guest, other]) await accepted(socket, 'room:join', { roomId: room.id });

  await rejected(guest, 'room:kick', { roomId: room.id, targetUserId: 'GovOther' }, 'ROOM_OWNER_REQUIRED');
  await rejected(host, 'room:kick', { roomId: room.id, targetUserId: 'GovHost' }, 'ROOM_KICK_FORBIDDEN');
  await rejected(host, 'room:kick', { roomId: room.id, targetUserId: 'Nobody' }, 'ROOM_KICK_TARGET_NOT_FOUND');

  const kicked = waitForEvent(guest, 'room:kicked', (e) => e.roomId === room.id);
  const result = await accepted(host, 'room:kick', { roomId: room.id, targetUserId: 'GovGuest' });
  assert.equal((await kicked).mode, 'banned');
  assert.deepEqual(result.members.map((m) => m.userId).sort(), ['GovHost', 'GovOther']);
  await rejected(guest, 'chat:send', { roomId: room.id, type: 'text', content: 'hi' }, 'ROOM_JOIN_REQUIRED');
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_BANNED');
  assert.equal((await accepted(other, 'room:members', { roomId: room.id })).members.length, 2);
});

test('trusted super admin can manage governance but cannot be kicked', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect(profiles[0]);
  const admin = await connect(profiles[2], { trustedAdmin: true });
  const room = await accepted(host, 'rooms:create', roomInput);
  await accepted(host, 'room:join', { roomId: room.id });
  await accepted(admin, 'room:join', { roomId: room.id });
  assert.equal((await accepted(admin, 'room:rules', { roomId: room.id, text: '官方群规' })).rules.text, '官方群规');
  const members = (await accepted(host, 'room:members', { roomId: room.id })).members;
  assert.equal(members.find((m) => m.userId === 'GovOther').role, 'admin');
  await rejected(host, 'room:kick', { roomId: room.id, targetUserId: 'GovOther' }, 'ROOM_KICK_FORBIDDEN');
});
