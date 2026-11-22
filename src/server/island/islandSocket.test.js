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
const { IslandRepository, IslandRepositoryError } = require('./islandRepository');

function createProfiles() {
  return [
    {
      uuid: '11111111-1111-4111-8111-111111111111',
      publicKey: 'island-owner-pub',
      userId: 'IslandHost',
      name: '岛主小橘',
      avatarUrl: ''
    },
    {
      uuid: '22222222-2222-4222-8222-222222222222',
      publicKey: 'island-guest-pub',
      userId: 'IslandGuest',
      name: '访客阿星',
      avatarUrl: ''
    },
    {
      uuid: '33333333-3333-4333-8333-333333333333',
      publicKey: 'island-stranger-pub',
      userId: 'IslandStranger',
      name: '路人甲',
      avatarUrl: ''
    },
    {
      uuid: '44444444-4444-4444-8444-444444444444',
      publicKey: 'island-admin-pub',
      userId: 'IslandAdmin',
      name: '超管',
      avatarUrl: ''
    }
  ];
}

async function emitAck(socket, event, payload) {
  return socket.timeout(2500).emitWithAck(event, payload);
}

function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 2500);
    function onEvent(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

async function createSocketFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-island-socket-'));
  const dataFile = path.join(dir, 'islands.json');
  const uploadDirectory = path.join(dir, 'uploads', 'islands');
  const profiles = createProfiles();
  const sockets = [];
  const trustedAdminToken = randomBytes(16).toString('hex');

  const profileRepoStub = {
    getByUuid(uuid) {
      return profiles.find((p) => p.uuid === uuid) || null;
    },
    getByPublicKey(publicKey) {
      return profiles.find((p) => p.publicKey === publicKey) || null;
    },
    getByUserId(userId) {
      return profiles.find((p) => p.userId.toLowerCase() === String(userId).toLowerCase()) || null;
    }
  };

  const repository = new IslandRepository({
    dataFile,
    uploadDirectory,
    resolveProfile({ uuid, publicKey, userId }) {
      if (uuid) return profileRepoStub.getByUuid(uuid);
      if (publicKey) return profileRepoStub.getByPublicKey(publicKey);
      if (userId) return profileRepoStub.getByUserId(userId);
      return null;
    }
  });

  const controllerFile = path.join(__dirname, '..', 'controller', 'islandController.js');
  const controllerModule = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(controllerFile, 'utf8'),
    {
      module: controllerModule,
      exports: controllerModule.exports,
      globalThis,
      console,
      require(name) {
        if (name === '../island/islandRepository') {
          return { islandRepository: repository, IslandRepositoryError };
        }
        if (name === '../user/profileRepository') {
          return { profileRepository: profileRepoStub };
        }
        return require(name);
      }
    },
    { filename: controllerFile }
  );
  const controller = controllerModule.exports;

  const server = http.createServer();
  const io = new Server(server, { transports: ['websocket'] });
  io.use((socket, next) => {
    if (socket.handshake.auth?.testAdminToken === trustedAdminToken) {
      socket.data.admin = { id: 'admin-1', username: 'root', displayName: '超管', role: 'super_admin' };
    }
    next();
  });
  io.on('connection', (socket) => controller.onSocket(socket, io));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  async function connect(profile, options = {}) {
    const client = createClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: {
        user: profile ? { uuid: profile.uuid } : undefined,
        ...(options.isAdmin ? { testAdminToken: trustedAdminToken } : {})
      }
    });
    sockets.push(client);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }

  t.after(async () => {
    for (const s of sockets) s.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await repository.writeQueue;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return {
    io,
    repository,
    controller,
    connect,
    owner: profiles[0],
    guest: profiles[1],
    stranger: profiles[2],
    admin: profiles[3]
  };
}

test('island realtime join, presence, cursor, lock, item upsert/move/delete, and eviction', async (t) => {
  const { io, repository, controller, connect, owner, guest, stranger, admin } = await createSocketFixture(t);
  const island = await repository.ensurePersonalIsland(owner);
  await repository.joinByInvite(island.inviteToken, guest);

  const ownerSocket = await connect(owner);
  const guestSocket = await connect(guest);
  const strangerSocket = await connect(stranger);
  const adminSocket = await connect(admin, { isAdmin: true });

  // Stranger cannot join
  const strangerJoin = await emitAck(strangerSocket, 'island:join', { islandId: island.id });
  assert.equal(strangerJoin.ok, false);
  assert.equal(strangerJoin.code, 'ISLAND_FORBIDDEN');

  // Owner joins
  const ownerJoin = await emitAck(ownerSocket, 'island:join', { islandId: island.id });
  assert.equal(ownerJoin.ok, true);
  assert.equal(ownerJoin.data.island.id, island.id);
  assert.equal(ownerJoin.data.island.isOwner, true);
  assert.equal(ownerJoin.data.onlineUsers.length, 1);

  // Guest joins -> owner receives presence update
  const presenceOnGuestJoin = waitForEvent(
    ownerSocket,
    'island:presence',
    (p) => p.islandId === island.id && p.onlineUsers.length === 2
  );
  const guestJoin = await emitAck(guestSocket, 'island:join', { islandId: island.id });
  assert.equal(guestJoin.ok, true);
  assert.equal(guestJoin.data.island.isOwner, false);
  assert.equal(guestJoin.data.island.inviteToken, undefined);
  const presence = await presenceOnGuestJoin;
  assert.equal(presence.onlineUsers.length, 2);
  assert.equal(controller.getOnlineCount(island.id), 2);
  const ownerPresence = presence.onlineUsers.find((u) => u.publicKey === owner.publicKey);
  const guestPresence = presence.onlineUsers.find((u) => u.publicKey === guest.publicKey);
  assert.ok(ownerPresence?.color);
  assert.ok(guestPresence?.color);
  assert.notEqual(ownerPresence.color, guestPresence.color);

  // Admin can join even without being a member
  const adminJoin = await emitAck(adminSocket, 'island:join', { islandId: island.id });
  assert.equal(adminJoin.ok, true);
  assert.equal(adminJoin.data.island.isAdmin, true);
  assert.equal(controller.getOnlineCount(island.id), 3);

  // Cursor broadcast
  const cursorReceived = waitForEvent(
    guestSocket,
    'island:cursor',
    (c) => c.publicKey === owner.publicKey && c.x === 120 && c.y === 340
  );
  ownerSocket.emit('island:cursor', {
    islandId: island.id,
    x: 120,
    y: 340,
    viewportCenter: { x: 500, y: 500 }
  });
  const cursorPayload = await cursorReceived;
  assert.deepEqual(cursorPayload.viewportCenter, { x: 500, y: 500 });

  // Owner upserts an item -> guest receives island:item:upserted
  const upsertBroadcast = waitForEvent(
    guestSocket,
    'island:item:upserted',
    (p) => p.islandId === island.id && p.item.type === 'note'
  );
  const upsertAck = await emitAck(ownerSocket, 'island:item:upsert', {
    islandId: island.id,
    item: {
      type: 'note',
      x: 50,
      y: 60,
      w: 200,
      h: 180,
      rotation: 0,
      zIndex: 1,
      data: { text: '实时便签', color: 'mint' }
    }
  });
  assert.equal(upsertAck.ok, true);
  const itemId = upsertAck.data.item.id;
  const upsertedEvent = await upsertBroadcast;
  assert.equal(upsertedEvent.item.id, itemId);

  // Item focus broadcasts presence with focusedItemId for each person
  const focusPresence = waitForEvent(
    guestSocket,
    'island:presence',
    (p) => p.onlineUsers.some((u) => u.publicKey === owner.publicKey && u.focusedItemId === itemId)
  );
  ownerSocket.emit('island:item:focus', { islandId: island.id, itemId });
  await focusPresence;

  const clearFocusPresence = waitForEvent(
    guestSocket,
    'island:presence',
    (p) => p.onlineUsers.some((u) => u.publicKey === owner.publicKey && u.focusedItemId === null)
  );
  ownerSocket.emit('island:item:focus', { islandId: island.id, itemId: null });
  await clearFocusPresence;

  // Item lock broadcasts presence with lockedItemId
  const lockPresence = waitForEvent(
    guestSocket,
    'island:presence',
    (p) => p.onlineUsers.some((u) => u.publicKey === owner.publicKey && u.lockedItemId === itemId)
  );
  ownerSocket.emit('island:item:lock', { islandId: island.id, itemId });
  await lockPresence;

  // Owner moves item (with persist: true) -> guest receives island:item:moved & disk updated
  const moveBroadcast = waitForEvent(
    guestSocket,
    'island:item:moved',
    (p) => p.itemId === itemId && p.x === 250 && p.y === 360
  );
  const moveAck = await emitAck(ownerSocket, 'island:item:move', {
    islandId: island.id,
    itemId,
    x: 250,
    y: 360,
    persist: true
  });
  assert.equal(moveAck.ok, true);
  await moveBroadcast;
  const persistedIsland = repository.getIslandById(island.id);
  assert.equal(persistedIsland.items[0].x, 250);
  assert.equal(persistedIsland.items[0].y, 360);

  // Guest CAN arrange (move, resize, zIndex) owner's item, but CANNOT delete it
  const guestMoveBroadcast = waitForEvent(
    ownerSocket,
    'island:item:moved',
    (p) => p.itemId === itemId && p.x === 320 && p.y === 410 && p.w === 260 && p.zIndex === 5
  );
  const guestMoveAck = await emitAck(guestSocket, 'island:item:move', {
    islandId: island.id,
    itemId,
    x: 320,
    y: 410,
    w: 260,
    h: 210,
    zIndex: 5,
    persist: true
  });
  assert.equal(guestMoveAck.ok, true);
  await guestMoveBroadcast;
  assert.equal(repository.getIslandById(island.id).items[0].x, 320);
  assert.equal(repository.getIslandById(island.id).items[0].zIndex, 5);

  // Guest can also move/resize/reorder owner's sticker and tape
  const stickerAck = await emitAck(ownerSocket, 'island:item:upsert', {
    islandId: island.id,
    item: { type: 'sticker', x: 10, y: 20, w: 112, h: 112, rotation: 0, zIndex: 6, data: { presetId: 'cloud' } }
  });
  const tapeAck = await emitAck(ownerSocket, 'island:item:upsert', {
    islandId: island.id,
    item: { type: 'tape', x: 30, y: 40, w: 200, h: 40, rotation: 0, zIndex: 7, data: { presetId: 'dots-sky' } }
  });
  assert.equal(stickerAck.ok, true);
  assert.equal(tapeAck.ok, true);

  const guestMoveSticker = await emitAck(guestSocket, 'island:item:move', {
    islandId: island.id,
    itemId: stickerAck.data.item.id,
    x: 150,
    y: 160,
    w: 140,
    h: 140,
    zIndex: 9,
    persist: true
  });
  const guestMoveTape = await emitAck(guestSocket, 'island:item:move', {
    islandId: island.id,
    itemId: tapeAck.data.item.id,
    x: 210,
    y: 220,
    rotation: 12,
    zIndex: 10,
    persist: true
  });
  assert.equal(guestMoveSticker.ok, true);
  assert.equal(guestMoveTape.ok, true);
  assert.equal(guestMoveSticker.data.item.x, 150);
  assert.equal(guestMoveTape.data.item.x, 210);
  assert.equal(guestMoveTape.data.item.rotation, 12);

  const forbiddenDelete = await emitAck(guestSocket, 'island:item:delete', {
    islandId: island.id,
    itemId
  });
  assert.equal(forbiddenDelete.ok, false);
  assert.equal(forbiddenDelete.code, 'ISLAND_ITEM_FORBIDDEN');

  // Owner deletes item -> guest receives island:item:deleted
  const deleteBroadcast = waitForEvent(
    guestSocket,
    'island:item:deleted',
    (p) => p.islandId === island.id && p.itemId === itemId
  );
  const deleteAck = await emitAck(ownerSocket, 'island:item:delete', {
    islandId: island.id,
    itemId
  });
  assert.equal(deleteAck.ok, true);
  await deleteBroadcast;
  assert.equal(
    repository.getIslandById(island.id).items.some((it) => it.id === itemId),
    false
  );

  // Evict guest member -> guest receives island:kicked & online count drops
  const kickedEvent = waitForEvent(guestSocket, 'island:kicked', (p) => p.islandId === island.id);
  controller.evictMember(io, island.id, guest.publicKey);
  await kickedEvent;
  assert.equal(controller.getOnlineCount(island.id), 2);

  // Leave island
  const presenceOnLeave = waitForEvent(
    ownerSocket,
    'island:presence',
    (p) => p.onlineUsers.length === 1
  );
  adminSocket.emit('island:leave', { islandId: island.id });
  await presenceOnLeave;
  assert.equal(controller.getOnlineCount(island.id), 1);
});
