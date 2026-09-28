const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const { RoomRepository, RoomRepositoryError } = require('./roomRepository');
const { MomentRepository } = require('../moment/momentRepository');
const { DoodleShareRepository } = require('../doodle/shareRepository');

function loadModule(file, dependencies) {
  const loaded = { exports: {} };
  const requireFromFile = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: loaded, exports: loaded.exports, require: (name) => dependencies[name] || requireFromFile(name),
    Error, setInterval, clearInterval, setTimeout, clearTimeout, console, URL
  }, { filename: file });
  return loaded.exports;
}

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-direct-'));
  const profiles = [1, 2, 3, 4].map((value) => ({
    uuid: `${`${value}`.repeat(8)}-${`${value}`.repeat(4)}-4${`${value}`.repeat(3)}-8${`${value}`.repeat(3)}-${`${value}`.repeat(12)}`,
    publicKey: `person-${value}`, userId: `Person${value}`, name: `用户${value}`, avatarUrl: '', isSystem: false
  }));
  const profileRepository = {
    getByUuid: (uuid) => profiles.find((profile) => profile.uuid === uuid),
    getByPublicKey: (publicKey) => profiles.find((profile) => profile.publicKey === publicKey),
    getByUserId: (userId) => profiles.find((profile) => profile.userId === userId),
    toPublic: (profile) => ({ publicKey: profile.publicKey, userId: profile.userId, name: profile.name, avatarUrl: '', isSystem: false })
  };
  let repository;
  const controller = loadModule(path.resolve(__dirname, '../controller/chatController.js'), {
    '../chat/roomRepository': { RoomRepositoryError, RoomRepository: class extends RoomRepository {
      constructor(options) { super({ ...options, dataFile: path.join(directory, 'chat.json'), uploadDirectory: path.join(directory, 'chat-uploads') }); repository = this; }
    } },
    '../user/profileRepository': { profileRepository }
  });
  const moments = new MomentRepository({ dataFile: path.join(directory, 'moments.json'), uploadDirectory: path.join(directory, 'moments') });
  const shares = new DoodleShareRepository({ dataFile: path.join(directory, 'shares.json'), uploadDirectory: path.join(directory, 'shares') });
  const presenter = loadModule(path.resolve(__dirname, '../moment/presenter.js'), { '../user/profileRepository': { profileRepository } });
  const audits = [];
  const reviews = [];
  const adminController = loadModule(path.resolve(__dirname, '../controller/adminController.js'), {
    './chatController': controller,
    '../models': { connectDB: async () => undefined },
    '../models/adminAudit': { AdminAudit: { create: async (entry) => audits.push(entry) } },
    '../user/profileRepository': { profileRepository },
    '../moment/momentRepository': { momentRepository: moments },
    '../moment/presenter': presenter,
    '../doodle/shareRepository': { doodleShareRepository: shares },
    '../doodle/reviewRepository': { doodleReviewRepository: { listAdminReviews: async () => reviews } },
    '../admin/auth': { authenticateCookieHeader: async (cookie) => cookie === 'test-admin=trusted' ? { id: 'test-admin', role: 'super_admin' } : null }
  });
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { transports: ['websocket'] });
  adminController.mountAdminController(app, io);
  io.use((socket, next) => { if (socket.handshake.auth?.testAdmin === 'trusted') socket.data.admin = { role: 'super_admin' }; next(); });
  io.on('connection', (socket) => controller.onSocket(socket, io));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => io.close(resolve));
    await Promise.all([repository.writeQueue, repository.cleanupQueue, moments.writeQueue, shares.writeQueue, shares.cleanupQueue]);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const connect = async (index, admin = false) => {
    const socket = client(url, { transports: ['websocket'], auth: { user: profiles[index], ...(admin ? { testAdmin: 'trusted' } : {}) }, forceNew: true });
    sockets.push(socket); await once(socket, 'connect'); return socket;
  };
  const api = (route, { admin = true, ...init } = {}) => fetch(`${url}/api/admin${route}`, {
    ...init, headers: { ...(admin ? { cookie: 'test-admin=trusted' } : {}), 'x-admin-request': '1', ...init.headers }
  });
  return { connect, profiles, repository, controller, moments, shares, reviews, audits, api };
}

async function request(socket, event, payload) {
  return payload === undefined ? socket.timeout(2000).emitWithAck(event) : socket.timeout(2000).emitWithAck(event, payload);
}
async function accepted(socket, event, payload) {
  const result = await request(socket, event, payload);
  assert.equal(result.ok, true, `${event}: ${result.error}`);
  return result.data;
}
async function rejected(socket, event, payload) {
  const result = await request(socket, event, payload);
  assert.equal(result.ok, false, `${event} must reject`);
  return result;
}

test('private conversations reuse chat while excluding third parties, invitations, discovery and spoofed participants', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(0), b = await f.connect(1), outsider = await f.connect(2), admin = await f.connect(3, true);
  const { roomId } = await accepted(a, 'direct:open', { publicKey: f.profiles[1].publicKey, participantKeys: f.profiles.map((p) => p.publicKey) });
  assert.equal((await accepted(b, 'direct:open', { publicKey: f.profiles[0].publicKey })).roomId, roomId);
  await rejected(a, 'direct:open', { publicKey: f.profiles[0].publicKey });
  await rejected(a, 'direct:open', { publicKey: 'missing' });
  for (const socket of [a, b, outsider, admin]) {
    assert.ok(!(await accepted(socket, 'rooms:list')).some((room) => room.id === roomId));
    assert.equal(await accepted(socket, 'rooms:search', { query: roomId }), null);
    for (const event of ['room:access:request', 'room:access:list', 'room:access:decide', 'room:access:revoke', 'room:invite:rotate', 'rooms:update', 'rooms:delete']) {
      await rejected(socket, event, { roomId, name: '改成群聊', isPrivate: false, requesterId: `guest-${f.profiles[2].uuid}`, decision: 'approved' });
    }
  }
  const room = (await accepted(a, 'room:join', { roomId })).room;
  assert.equal(room.kind, 'direct'); assert.equal(room.isOwner, false); assert.equal(room.peer.userId, f.profiles[1].userId);
  assert.equal(JSON.stringify(room).includes(f.profiles[1].uuid), false);
  await accepted(b, 'room:join', { roomId });
  for (const socket of [outsider, admin]) {
    await rejected(socket, 'room:join', { roomId, inviteToken: 'fake', isAdmin: true });
    await rejected(socket, 'chat:history', { roomId });
    await rejected(socket, 'chat:send', { roomId, content: 'intrusion' });
    await rejected(socket, 'direct:read', { roomId });
    assert.equal((await accepted(socket, 'social:list')).conversations.length, 0);
  }
  await rejected(a, 'poll:create', { roomId, question: 'poll', options: ['a', 'b'] });
  await rejected(a, 'game:create', { roomId, kind: 'dice' });
  assert.equal(f.repository.getRoom(roomId).participantKeys.length, 2);
  assert.equal(f.repository.getRoom(roomId).inviteToken, undefined);
});

test('unread messages, replies and favorites survive reload, remain owner-scoped and clear across tabs only through read cursors', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(0), b = await f.connect(1), bOtherTab = await f.connect(1);
  const { roomId } = await accepted(a, 'direct:open', { publicKey: f.profiles[1].publicKey });
  await accepted(a, 'room:join', { roomId });
  const pushed = once(b, 'social:changed');
  const first = await accepted(a, 'chat:send', { roomId, type: 'text', content: '第一条私信' });
  await pushed;
  assert.equal((await accepted(b, 'social:list')).conversations[0].unreadCount, 1);
  assert.equal((await accepted(a, 'social:list')).conversations[0].unreadCount, 0);
  await accepted(b, 'room:join', { roomId });
  assert.equal((await accepted(b, 'social:list')).conversations[0].unreadCount, 1, 'joining alone must not mark background tabs read');
  const second = await accepted(a, 'chat:send', { roomId, content: '第二条私信' });
  const crossTab = once(bOtherTab, 'social:changed');
  await accepted(b, 'direct:read', { roomId, messageId: first.id });
  await crossTab;
  assert.equal((await accepted(bOtherTab, 'social:list')).conversations[0].unreadCount, 1, 'a late message stays unread');
  await accepted(b, 'direct:read', { roomId, messageId: second.id });
  await accepted(b, 'direct:read', { roomId, messageId: first.id });
  assert.equal((await accepted(bOtherTab, 'social:list')).conversations[0].unreadCount, 0);
  const reply = await accepted(b, 'chat:send', { roomId, content: '收到', replyToId: first.id });
  assert.equal(reply.replyTo.content, '第一条私信');
  await accepted(a, 'favorite:set', { publicKey: f.profiles[1].publicKey, favorite: true });
  await accepted(a, 'favorite:set', { publicKey: f.profiles[1].publicKey, favorite: true });
  assert.equal((await accepted(a, 'social:list')).favorites.length, 1);
  assert.equal((await accepted(b, 'social:list')).favorites.length, 0);
  f.profiles[1].userId = 'RenamedPerson';
  f.profiles[1].name = '改名后';
  await f.repository.writeQueue;
  const reloadFile = path.join(path.dirname(f.repository.dataFile), 'reload.json');
  fs.copyFileSync(f.repository.dataFile, reloadFile);
  const reloaded = new RoomRepository({ dataFile: reloadFile, resolveProfile: f.repository.resolveProfile });
  const userA = { id: `guest-${f.profiles[0].uuid}`, ...f.profiles[0] };
  assert.equal(reloaded.listFavorites(userA)[0].userId, 'RenamedPerson');
  assert.equal(reloaded.listDirects(userA)[0].unreadCount, 1);
  assert.equal(reloaded.listDirects(f.profiles[1])[0].unreadCount, 0);
  assert.equal(reloaded.getHistory(roomId).messages.length, 3);
  assert.equal(reloaded.openDirect(userA, f.profiles[1].publicKey).id, roomId);
  await reloaded.writeQueue;
  await accepted(a, 'favorite:set', { publicKey: f.profiles[1].publicKey, favorite: false });
  assert.equal((await accepted(a, 'social:list')).conversations.length, 1, 'unfavorite preserves conversation');
  await rejected(a, 'chat:recall', { roomId, messageId: reply.id });
  await accepted(b, 'chat:recall', { roomId, messageId: reply.id });
  assert.equal((await accepted(a, 'social:list')).conversations[0].unreadCount, 0);
  f.controller.adminDeleteUserData(f.profiles[1], { sockets: { sockets: new Map() }, to: () => ({ emit() {} }), emit() {} });
  assert.equal(f.repository.getRoom(roomId), null);
});

test('admin APIs authenticate, expose all direct history with lossless pagination, manage moments and show actual camera links', async (t) => {
  const f = await fixture(t);
  const a = await f.connect(0), b = await f.connect(1), c = await f.connect(2);
  const { roomId } = await accepted(a, 'direct:open', { publicKey: f.profiles[1].publicKey });
  await accepted(b, 'direct:open', { publicKey: f.profiles[2].publicKey });
  await accepted(a, 'room:join', { roomId });
  for (let index = 0; index < 55; index++) await accepted(a, 'chat:send', { roomId, content: `message ${index}` });
  for (const route of ['/directs', `/directs/${roomId}/messages`, '/moments', '/doodle-shares']) assert.equal((await f.api(route, { admin: false })).status, 401);
  assert.equal((await (await f.api('/directs')).json()).items.length, 2);
  const response = await f.api(`/directs/${roomId}/messages`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const recent = await response.json();
  assert.equal(recent.messages.length, 50); assert.equal(recent.hasMore, true);
  const older = await (await f.api(`/directs/${roomId}/messages?before=${recent.before}`)).json();
  assert.equal(older.messages.length, 5); assert.equal(older.hasMore, false);
  assert.equal(new Set([...older.messages, ...recent.messages].map((message) => message.id)).size, 55);
  assert.equal((await accepted(b, 'social:list')).conversations.find((item) => item.id === roomId).unreadCount, 55, 'admin viewing never consumes recipient unread state');
  assert.equal((await f.api('/directs/soul-harbor/messages')).status, 404);
  const moment = await f.moments.createMoment({ ownerUuid: f.profiles[0].uuid, text: '后台管理心迹' });
  const comment = await f.moments.createComment(moment.id, f.profiles[1].uuid, { text: '管理评论' });
  assert.equal((await f.api(`/moments/${moment.id}`, { admin: false, method: 'DELETE' })).status, 401);
  const feed = await (await f.api('/moments')).json();
  assert.equal(feed.items[0].text, '后台管理心迹'); assert.equal(feed.items[0].comments.length, 1);
  assert.equal((await f.api(`/moments/${moment.id}/comments/${comment.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.api(`/moments/${moment.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await (await f.api('/moments')).json()).total, 0);
  const share = await f.shares.createShare({ ownerUuid: f.profiles[0].uuid, title: '相机分享', style: 'comic', template: 'comic-cover', mimeType: 'image/png' }, Buffer.from('image'));
  f.reviews.push({ id: 'review-test', ownerUuid: f.profiles[0].uuid, shareId: share.id });
  const links = await (await f.api('/doodle-shares')).json();
  assert.equal(links.items[0].shareUrl, `/doodle/s/${share.id}`);
  const reviews = await (await f.api('/doodles')).json();
  assert.equal(reviews.items[0].shares[0].url, `/doodle/s/${share.id}`);
  assert.ok(f.audits.some((audit) => audit.action === 'direct.view'));
  assert.ok(f.audits.some((audit) => audit.action === 'moment.delete'));
  assert.equal((await accepted(c, 'social:list')).conversations.length, 1);
});
