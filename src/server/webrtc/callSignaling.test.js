const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { createHmac } = require('node:crypto');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { RoomRepository, RoomRepositoryError } = require('../chat/roomRepository');
const { CallSignaling, getIceConfiguration } = require('./callSignaling');

const profiles = Array.from({ length: 6 }, (_, i) => ({ uuid: `${String(i + 1).repeat(8)}-1111-4111-8111-111111111111`, userId: `CallUser${i}`, publicKey: `call-public-${i}`, name: `伙伴 ${i}` }));
const roomId = 'soul-harbor';
const joinPayload = (attemptId, extra = {}) => ({ roomId, attemptId, mode: 'audio', microphoneEnabled: true, cameraEnabled: false, ...extra });
async function request(socket, event, payload) { return payload === undefined ? socket.timeout(2000).emitWithAck(event) : socket.timeout(2000).emitWithAck(event, payload); }
async function accepted(socket, event, payload) {
  const result = await request(socket, event, payload);
  assert.equal(result.ok, true, `${event}: ${result.error || ''}`);
  if (event.startsWith('call:')) for (const profile of profiles) assert.equal(JSON.stringify(result).includes(profile.uuid), false, 'private identity must not be sent');
  return result.data;
}
async function rejected(socket, event, payload, code) {
  const result = await request(socket, event, payload);
  assert.equal(result.ok, false, event);
  if (code) assert.equal(result.code, code, result.error);
}
function nextEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Missing ${event}`)); }, 2000);
    const listener = (value) => { if (predicate(value)) { clearTimeout(timer); socket.off(event, listener); resolve(value); } };
    socket.on(event, listener);
  });
}

async function fixture(t, waitingTimeout) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-call-test-'));
  const io = new Server(http.createServer(), { transports: ['websocket'] });
  const sockets = [];
  let repository;
  const source = path.join(__dirname, '../controller/chatController.js');
  const controllerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module: controllerModule, exports: controllerModule.exports, Error, console, setInterval, clearInterval,
    require(name) {
      if (name === '../chat/roomRepository') return { RoomRepositoryError, RoomRepository: class extends RoomRepository {
        constructor(options) { super({ ...options, dataFile: path.join(directory, 'chat.json'), uploadDirectory: path.join(directory, 'uploads') }); repository = this; }
      } };
      if (name === '../user/profileRepository') return { profileRepository: {
        getByUuid: (uuid) => profiles.find((profile) => profile.uuid === uuid),
        getByUserId: (userId) => profiles.find((profile) => profile.userId === userId),
        getByPublicKey: (key) => profiles.find((profile) => profile.publicKey === key)
      } };
      if (name === '../webrtc/callSignaling') return { CallSignaling: class extends CallSignaling { constructor(options) { super({ ...options, waitingTimeout, env: {} }); } } };
      throw new Error(`Unexpected dependency ${name}`);
    }
  }, { filename: source });
  io.on('connection', (socket) => controllerModule.exports.onSocket(socket, io));
  await new Promise((resolve) => io.httpServer.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => io.close(resolve));
    await repository.writeQueue; await repository.cleanupQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function connect(index = 0, join = roomId) {
    const socket = createClient(`http://127.0.0.1:${io.httpServer.address().port}`, { transports: ['websocket'], auth: { user: { uuid: profiles[index].uuid } }, autoConnect: false, reconnection: false, forceNew: true });
    sockets.push(socket);
    const connected = nextEvent(socket, 'connect'); socket.connect(); await connected;
    if (join) await accepted(socket, 'room:join', { roomId: join });
    return socket;
  }
  return { connect, controller: controllerModule.exports, io };
}

test('solo waiting lasts one hour, cancels with company and starts fresh after the last peer leaves', () => {
  let now = 0, id = 0;
  const timers = new Map(), events = [], timerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'callSignaling.js'), 'utf8'), {
    module: timerModule, require, process, setTimeout: (run, delay) => { const timer = ++id; timers.set(timer, { run, at: now + delay }); return timer; }, clearTimeout: timer => timers.delete(timer)
  });
  const service = new timerModule.exports.CallSignaling({ requireJoinedRoom() {} });
  const io = { to: () => ({ emit: (_event, state) => events.push(state) }) };
  const call = { roomId, id: 'one-hour-call', members: new Map([['host', { userId: 'host', participant: {} }]]) };
  service.calls.set(roomId, call); service.users.set('host', 'host');
  const advance = ms => { now += ms; for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.run(); } };
  service.scheduleWaiting(io, call);
  advance(5 * 60000); assert.ok(service.snapshot(roomId).call, 'five minutes of waiting must not end the call');
  call.members.set('guest', { userId: 'guest', participant: {} }); service.scheduleWaiting(io, call);
  advance(2 * 3600000); assert.ok(service.snapshot(roomId).call, 'a joined peer cancels the solo timer');
  service.leave({ id: 'guest', data: { roomId } }, io);
  advance(3599999); assert.ok(service.snapshot(roomId).call, 'remaining participant gets a full new hour');
  advance(1); assert.equal(service.snapshot(roomId).call, null); assert.equal(events.at(-1).reason, 'timeout'); assert.equal(service.users.size, 0);
});

test('call signaling requires room access and actual call membership; never trusts caller identity', async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const guest = await connect(1);
  const outsider = await connect(2, 'starlight-camp');
  const unjoined = await connect(3, null);
  for (const socket of [outsider, unjoined]) {
    for (const event of ['call:state', 'call:join', 'call:media', 'call:signal']) await rejected(socket, event, joinPayload('attempt-one'), 'ROOM_JOIN_REQUIRED');
  }
  const first = await accepted(host, 'call:join', joinPayload('attempt-one', { name: 'forged', userId: 'forged' }));
  assert.equal(first.call.participants[0].name, profiles[0].name);
  assert.equal(first.call.participants[0].cameraEnabled, false);
  const signal = { roomId, callId: first.call.id, to: host.id, description: { type: 'offer', sdp: 'v=0' } };
  await rejected(guest, 'call:signal', signal, 'CALL_ENDED');
  await accepted(guest, 'call:join', joinPayload('attempt-two', { callId: first.call.id }));
  await rejected(guest, 'call:signal', { ...signal, callId: 'old-call' }, 'CALL_ENDED');
  await rejected(host, 'call:signal', { ...signal, to: outsider.id }, 'CALL_PEER_LEFT');
  await rejected(host, 'call:signal', signal, 'CALL_PEER_LEFT');
  const delivered = nextEvent(host, 'call:signal');
  await accepted(guest, 'call:signal', { ...signal, from: host.id });
  assert.equal((await delivered).from, guest.id);
  const screenSignal = nextEvent(host, 'call:signal');
  await accepted(guest, 'call:signal', { ...signal, screenStreamId: 'screen-stream-one' });
  assert.equal((await screenSignal).screenStreamId, 'screen-stream-one');
  await rejected(guest, 'call:signal', { ...signal, screenStreamId: 'https://forged-stream' }, 'CALL_INVALID');
  await rejected(guest, 'call:signal', { ...signal, description: { type: 'offer', sdp: 'x'.repeat(65537) } }, 'CALL_INVALID');
  await rejected(guest, 'call:signal', { ...signal, description: null, candidate: { candidate: 'candidate:x', sdpMid: {} } }, 'CALL_INVALID');
  const state = await accepted(host, 'call:state', { roomId });
  assert.equal(state.call.participants.length, 2);
  const history = await accepted(host, 'chat:history', { roomId });
  assert.equal(JSON.stringify(history).includes('candidate:'), false);
});

test('four-person capacity, multi-tab busy and idempotent joins are enforced on the server', async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const otherTab = await connect();
  const first = await accepted(host, 'call:join', joinPayload('attempt-one'));
  assert.equal((await accepted(host, 'call:join', joinPayload('attempt-one'))).revision, first.revision);
  await rejected(host, 'call:join', joinPayload('attempt-new'), 'CALL_BUSY');
  await rejected(otherTab, 'call:join', joinPayload('attempt-tab'), 'CALL_BUSY');
  for (let index = 1; index < 4; index++) await accepted(await connect(index), 'call:join', joinPayload(`attempt-${index}`));
  await rejected(await connect(4), 'call:join', joinPayload('attempt-full'), 'CALL_FULL');
  assert.equal((await accepted(host, 'call:state', { roomId })).call.participants.length, 4);
});

test('late cancellation cannot hang up the next call and old call IDs cannot rejoin it', async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const first = await accepted(host, 'call:join', joinPayload('attempt-one'));
  await accepted(host, 'call:leave', { roomId, attemptId: 'attempt-one' });
  const second = await accepted(host, 'call:join', joinPayload('attempt-two'));
  await accepted(host, 'call:leave', { roomId, attemptId: 'attempt-one' });
  assert.equal((await accepted(host, 'call:state', { roomId })).call.id, second.call.id);
  await rejected(await connect(1), 'call:join', joinPayload('attempt-old', { callId: first.call.id }), 'CALL_ENDED');
  await accepted(host, 'room:join', { roomId });
  assert.equal((await accepted(host, 'call:state', { roomId })).call.id, second.call.id, 'idempotent room join preserves call');
});

test('media changes broadcast, room switches/disconnects release membership, and solo calls time out', async (t) => {
  const { connect } = await fixture(t, 100);
  const host = await connect();
  const guest = await connect(1);
  const first = await accepted(host, 'call:join', joinPayload('attempt-one'));
  await accepted(guest, 'call:join', joinPayload('attempt-two'));
  const media = nextEvent(guest, 'call:state', (state) => state.call?.participants[0].cameraEnabled);
  await accepted(host, 'call:media', { roomId, callId: first.call.id, cameraEnabled: true, microphoneEnabled: false });
  assert.equal((await media).call.participants[0].microphoneEnabled, false);
  const left = nextEvent(guest, 'call:state', (state) => state.call?.participants.length === 1);
  await accepted(host, 'room:join', { roomId: 'starlight-camp' });
  await left;
  const ended = await nextEvent(guest, 'call:state', (state) => state.reason === 'timeout');
  assert.equal(ended.call, null);
  await accepted(guest, 'call:join', joinPayload('attempt-three'));
  const observer = await connect(2);
  const disconnected = nextEvent(observer, 'call:state', (state) => !state.call);
  guest.disconnect(); await disconnected;
});

test('private access revocation and room deletion terminate participants through the real chat lifecycle', async (t) => {
  const { connect, controller, io } = await fixture(t);
  const host = await connect();
  const guest = await connect(1);
  const room = await accepted(host, 'rooms:create', { name: '通话私密星球', isPrivate: true });
  await accepted(host, 'room:join', { roomId: room.id });
  await accepted(guest, 'room:access:request', { roomId: room.id });
  const access = await accepted(host, 'room:access:list', { roomId: room.id });
  await accepted(host, 'room:access:decide', { roomId: room.id, requesterId: access.applications[0].requesterId, decision: 'approved' });
  await accepted(guest, 'room:join', { roomId: room.id });
  const call = await accepted(host, 'call:join', joinPayload('attempt-one', { roomId: room.id }));
  await accepted(guest, 'call:join', joinPayload('attempt-two', { roomId: room.id }));
  const revoked = nextEvent(guest, 'call:state', (state) => !state.call?.participants.some((member) => member.peerId === guest.id));
  await accepted(host, 'room:access:revoke', { roomId: room.id, requesterId: access.applications[0].requesterId });
  await revoked;
  await rejected(guest, 'call:signal', { roomId: room.id, callId: call.call.id, to: host.id, candidate: { candidate: '' } }, 'ROOM_JOIN_REQUIRED');
  const deleted = nextEvent(host, 'call:state', (state) => !state.call);
  controller.adminDeleteRoom(room.id, io);
  await deleted;
});

test('TURN credentials are temporary, signed server-side and fail closed on invalid deployment configuration', () => {
  const now = 2000000000000;
  const configuration = getIceConfiguration({ WEBRTC_TURN_URLS: 'turn:relay.example:3478,turns:relay.example:5349', WEBRTC_TURN_SECRET: 'server-only-secret', WEBRTC_RELAY_ONLY: 'true' }, now);
  const turn = configuration.iceServers[1];
  assert.equal(configuration.iceTransportPolicy, 'relay');
  assert.equal(Number(turn.username.split(':')[0]), now / 1000 + 86400);
  assert.equal(turn.credential, createHmac('sha1', 'server-only-secret').update(turn.username).digest('base64'));
  assert.equal(JSON.stringify(configuration).includes('server-only-secret'), false);
  assert.throws(() => getIceConfiguration({ WEBRTC_TURN_URLS: 'turn:relay.example:3478' }), /尚未配置/);
  assert.throws(() => getIceConfiguration({ WEBRTC_RELAY_ONLY: 'true' }), /尚未配置/);
  assert.throws(() => getIceConfiguration({ WEBRTC_STUN_URLS: 'https://invalid' }), /配置无效/);
});
