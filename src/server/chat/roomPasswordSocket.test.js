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

const INITIAL_PASSWORD = 'Q7v9';
const CHANGED_PASSWORD = 'R8x2';
const roomInput = {
  name: '密码授权回归', description: '', tags: [], isPrivate: false,
  passwordEnabled: true, password: INITIAL_PASSWORD
};

function createProfiles() {
  return [
    { uuid: '11111111-1111-4111-8111-111111111111', userId: 'PasswordHost', publicKey: 'password-host-public', name: '创建者' },
    { uuid: '22222222-2222-4222-8222-222222222222', userId: 'PasswordGuest', publicKey: 'password-guest-public', name: '访客' },
    { uuid: '33333333-3333-4333-8333-333333333333', userId: 'PasswordOther', publicKey: 'password-other-public', name: '另一位访客' },
    { uuid: '44444444-4444-4444-8444-444444444444', userId: 'PasswordAdmin', publicKey: 'password-admin-public', name: '管理员' }
  ];
}

function assertNoPasswordSecrets(value) {
  if (value === null || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'hasPassword') {
      assert.equal(/^(password|passwordHash|passwordSalt|passwordVersion|passwordAccess|passwordGrants|roomPasswordAccess|roomPasswordGrants|authorizedUserIds|passwordAuthorizedUsers|_passwordPrivate)$/i.test(key), false,
        `private password field ${key} must not cross the socket boundary`);
    }
    assertNoPasswordSecrets(nested);
  }
  const serialized = JSON.stringify(value);
  for (const password of [INITIAL_PASSWORD, CHANGED_PASSWORD]) {
    assert.equal(serialized.includes(password), false, 'plaintext room passwords must not cross the socket boundary');
  }
}

async function request(socket, event, payload) {
  const response = payload === undefined
    ? await socket.timeout(2000).emitWithAck(event)
    : await socket.timeout(2000).emitWithAck(event, payload);
  assert.equal(typeof response.ok, 'boolean');
  assertNoPasswordSecrets(response);
  return response;
}

async function accepted(socket, event, payload) {
  const response = await request(socket, event, payload);
  assert.equal(response.ok, true, `${event}: ${response.code || ''} ${response.error || ''}`);
  return response.data;
}

async function rejected(socket, event, payload, code) {
  const response = await request(socket, event, payload);
  assert.equal(response.ok, false, `${event} unexpectedly accepted an unauthorized action`);
  assert.equal(typeof response.error, 'string');
  assert.equal(response.code, code);
}

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
  const directory = options.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'neon-password-sockets-'));
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

const createRoom = (socket, overrides = {}) => accepted(socket, 'rooms:create', { ...roomInput, ...overrides });
const join = (socket, roomId, password) => accepted(socket, 'room:join', { roomId, ...(password ? { password } : {}) });
const leave = (socket) => accepted(socket, 'room:leave');
const updateRoom = (socket, roomId, overrides = {}) => accepted(socket, 'rooms:update', { ...roomInput, password: '', roomId, ...overrides });

test('room creator and trusted super admin enter without a password, but client claims cannot bypass it', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect();
  const room = await createRoom(host);
  assert.equal(room.hasPassword, true);
  assert.equal((await join(host, room.id)).room.isCreator, true);
  await leave(host);
  assert.equal((await join(host, room.id, 'bad')).room.id, room.id);

  const admin = await connect(profiles[3], { trustedAdmin: true });
  assert.equal((await join(admin, room.id)).room.membership, 'admin');
  const forgedAdmin = await connect(profiles[2], {
    auth: {
      admin: { role: 'super_admin' }, role: 'super_admin', isAdmin: true,
      user: { role: 'super_admin', isAdmin: true, id: `guest-${profiles[0].uuid}`, userId: profiles[0].userId }
    }
  });
  await rejected(forgedAdmin, 'room:join', { roomId: room.id, isAdmin: true }, 'ROOM_PASSWORD_REQUIRED');
  await rejected(forgedAdmin, 'rooms:update', { ...roomInput, roomId: room.id, passwordEnabled: false, isAdmin: true }, 'ROOM_OWNER_REQUIRED');
});

test('verified access survives leaving and reconnecting while staying bound to the same user and room', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect();
  const room = await createRoom(host);
  const secondRoom = await createRoom(host, { name: '相同密码的另一个房间' });
  const guest = await connect(profiles[1]);
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  await rejected(guest, 'room:join', { roomId: room.id, password: 'bad' }, 'ROOM_PASSWORD_INVALID');
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  await join(guest, room.id, INITIAL_PASSWORD);
  await accepted(guest, 'chat:send', { roomId: room.id, type: 'text', content: '离开资料页后还能继续聊天' });
  await leave(guest);
  const returned = await join(guest, room.id);
  assert.equal(returned.messages.length, 1);
  await rejected(guest, 'room:join', { roomId: secondRoom.id }, 'ROOM_PASSWORD_REQUIRED');

  const other = await connect(profiles[2]);
  await rejected(other, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  guest.disconnect();
  // 展示用 userId 可以修改，授权必须使用未变化的浏览器身份。
  profiles[1].userId = 'RenamedGuest';
  const reconnected = await connect(profiles[1]);
  assert.equal((await join(reconnected, room.id)).room.id, room.id);
  assert.equal((await accepted(reconnected, 'chat:history', { roomId: room.id })).messages.length, 1);
  await rejected(reconnected, 'room:join', { roomId: secondRoom.id }, 'ROOM_PASSWORD_REQUIRED');
});

test('password verification persists across a real socket server and repository restart', { timeout: 10000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-password-restart-'));
  const profiles = createProfiles();
  let first;
  let restarted;
  t.after(async () => {
    await first?.stop();
    await restarted?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  first = await fixture(t, { directory, profiles });
  const room = await createRoom(await first.connect());
  await join(await first.connect(profiles[1]), room.id, INITIAL_PASSWORD);
  await first.stop();

  profiles[1].userId = 'RestartedGuest';
  restarted = await fixture(t, { directory, profiles });
  assert.equal((await join(await restarted.connect(profiles[1]), room.id)).room.id, room.id);
  assert.equal((await join(await restarted.connect(), room.id)).room.isCreator, true);
  await rejected(await restarted.connect(profiles[2]), 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
});

test('ordinary members cannot change or remove passwords and room updates never disclose stored secrets', { timeout: 10000 }, async (t) => {
  const { connect, profiles, repository } = await fixture(t);
  const host = await connect();
  const room = await createRoom(host);
  const guest = await connect(profiles[1]);
  await join(host, room.id);
  await join(guest, room.id, INITIAL_PASSWORD);
  for (const overrides of [
    { password: CHANGED_PASSWORD },
    { passwordEnabled: false, password: '' }
  ]) {
    await rejected(guest, 'rooms:update', { ...roomInput, roomId: room.id, ...overrides }, 'ROOM_OWNER_REQUIRED');
  }
  const updatedEvent = waitForEvent(guest, 'room:updated', (updated) => updated.id === room.id && updated.name === '只更新名称');
  await updateRoom(host, room.id, { name: '只更新名称' });
  assert.equal((await updatedEvent).hasPassword, true);
  await leave(guest);
  await join(guest, room.id);
  const listed = await accepted(guest, 'rooms:list');
  assert.equal(listed.find((entry) => entry.id === room.id).hasPassword, true);
  assert.equal((await accepted(guest, 'rooms:search', { query: room.code })).hasPassword, true);

  const stored = repository.getRoom(room.id);
  assert.ok(stored.passwordHash);
  assert.ok(stored.passwordSalt);
  const publicData = JSON.stringify([listed, ...guest.receivedEvents]);
  assert.equal(publicData.includes(stored.passwordHash), false);
  assert.equal(publicData.includes(stored.passwordSalt), false);

  await updateRoom(host, room.id, { password: CHANGED_PASSWORD });
  await leave(guest);
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  await rejected(guest, 'room:join', { roomId: room.id, password: INITIAL_PASSWORD }, 'ROOM_PASSWORD_INVALID');
  await join(guest, room.id, CHANGED_PASSWORD);
  assert.equal((await updateRoom(host, room.id, { passwordEnabled: false })).hasPassword, false);
  await leave(guest);
  await join(guest, room.id);
  assert.equal((await join(await connect(profiles[2]), room.id)).room.hasPassword, false);
});

test('removing then restoring a password or switching through private mode invalidates prior grants', { timeout: 10000 }, async (t) => {
  const { connect, profiles } = await fixture(t);
  const host = await connect();
  const room = await createRoom(host);
  const guest = await connect(profiles[1]);
  await join(host, room.id);
  await join(guest, room.id, INITIAL_PASSWORD);
  await updateRoom(host, room.id, { passwordEnabled: false });
  await updateRoom(host, room.id, { password: INITIAL_PASSWORD });
  await leave(guest);
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  await join(guest, room.id, INITIAL_PASSWORD);

  const accessChanged = waitForEvent(guest, 'room:access:changed', (event) => event.roomId === room.id);
  assert.equal((await updateRoom(host, room.id, { isPrivate: true })).hasPassword, false);
  await accessChanged;
  await rejected(guest, 'chat:history', { roomId: room.id }, 'ROOM_JOIN_REQUIRED');
  await rejected(guest, 'room:join', { roomId: room.id, password: INITIAL_PASSWORD }, 'ROOM_ACCESS_REQUIRED');
  await updateRoom(host, room.id, { isPrivate: false, password: INITIAL_PASSWORD });
  await rejected(guest, 'room:join', { roomId: room.id }, 'ROOM_PASSWORD_REQUIRED');
  await join(guest, room.id, INITIAL_PASSWORD);
});
