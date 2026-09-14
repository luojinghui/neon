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

const profiles = [
  { uuid: '11111111-1111-4111-8111-111111111111', userId: 'PollHost', publicKey: 'poll-host-public', name: '投票发起人' },
  { uuid: '22222222-2222-4222-8222-222222222222', userId: 'PollGuest', publicKey: 'poll-guest-public', name: '参与者' },
  { uuid: '33333333-3333-4333-8333-333333333333', userId: 'PollThird', publicKey: 'poll-third-public', name: '另一位参与者' }
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertNoPrivateVotes(value) {
  const serialized = JSON.stringify(value);
  for (const profile of profiles) assert.equal(serialized.includes(profile.uuid), false, 'browser identity must remain private');
  assert.equal(serialized.includes('_pollPrivate'), false, 'private poll storage must not cross the socket boundary');
  assert.equal(serialized.includes('"votes"'), false, 'individual ballots must not cross the socket boundary');
}

function assertPoll(message, counts, selectedOptionId) {
  assert.equal(message.type, 'poll');
  assert.deepEqual(message.poll.options.map((option) => option.count), counts);
  assert.equal(message.poll.totalVotes, counts.reduce((total, count) => total + count, 0));
  assert.equal(message.poll.selectedOptionId, selectedOptionId);
  assertNoPrivateVotes(message);
}

async function request(socket, event, payload) {
  const response = await socket.timeout(2000).emitWithAck(event, payload);
  assert.equal(typeof response.ok, 'boolean');
  assertNoPrivateVotes(response);
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

function waitForMessage(socket, predicate, timeout = 3000) {
  const found = socket.receivedMessages.find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat:message', onMessage);
      reject(new Error('Timed out waiting for a poll broadcast'));
    }, timeout);
    function onMessage(message) {
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('chat:message', onMessage);
      resolve(message);
    }
    socket.on('chat:message', onMessage);
  });
}

async function fixture(t, options = {}) {
  const ownsDirectory = !options.directory;
  const directory = options.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'neon-poll-sockets-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const sockets = [];
  let repository;
  let stopScheduler;
  let stopped = false;
  const server = http.createServer();
  const io = new Server(server, { transports: ['websocket'] });
  // 注入临时仓库，加载真实控制器时不触碰默认 .data 数据。
  const controllerFile = path.join(__dirname, '..', 'controller', 'chatController.js');
  const controllerModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(controllerFile, 'utf8'), {
    module: controllerModule,
    exports: controllerModule.exports,
    require(name) {
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
    Error,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console
  }, { filename: controllerFile });
  const controller = controllerModule.exports;
  io.on('connection', (socket) => controller.onSocket(socket, io));

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (typeof stopScheduler === 'function') stopScheduler();
    for (const socket of sockets) socket.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await repository.writeQueue;
    await repository.cleanupQueue;
  }
  t.after(async () => {
    await stop();
    if (ownsDirectory) fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  if (options.scheduler !== false) {
    assert.equal(typeof controller.startPollScheduler, 'function');
    stopScheduler = controller.startPollScheduler(io);
    assert.equal(typeof stopScheduler, 'function', 'scheduler must expose cleanup for server shutdown');
  }

  async function connect(profile = profiles[0]) {
    const socket = createClient(`http://127.0.0.1:${server.address().port}`, {
      transports: ['websocket'],
      auth: { user: { uuid: profile.uuid } },
      reconnection: false,
      forceNew: true,
      autoConnect: false
    });
    sockets.push(socket);
    socket.receivedMessages = [];
    socket.on('chat:message', (message) => socket.receivedMessages.push(message));
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }

  return { directory, dataFile, repository, connect, stop };
}

const join = (socket, roomId = 'soul-harbor') => accepted(socket, 'room:join', { roomId });
const createPoll = (socket, input = {}) => accepted(socket, 'poll:create', {
  roomId: 'soul-harbor', question: '周末去哪儿？', options: ['公园', '博物馆'], ...input
});

test('poll socket operations enforce joined-room access and only the initiator can close', { timeout: 10000 }, async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const guest = await connect(profiles[1]);
  await rejected(host, 'poll:create', { roomId: 'soul-harbor', question: '去哪里？', options: ['公园', '博物馆'] }, 'ROOM_JOIN_REQUIRED');
  await join(host);
  const source = await createPoll(host);
  const target = { roomId: source.roomId, messageId: source.id, optionId: source.poll.options[0].id };
  for (const event of ['poll:vote', 'poll:get', 'poll:close']) await rejected(guest, event, target, 'ROOM_JOIN_REQUIRED');

  await join(guest, 'starlight-camp');
  for (const event of ['poll:vote', 'poll:get', 'poll:close']) await rejected(guest, event, target, 'ROOM_JOIN_REQUIRED');
  for (const event of ['poll:vote', 'poll:get', 'poll:close']) {
    const response = await request(guest, event, { ...target, roomId: 'starlight-camp' });
    assert.equal(response.ok, false, `${event} must not resolve a message from another room`);
  }

  await join(guest);
  assert.equal((await accepted(guest, 'poll:get', target)).id, source.id);
  await rejected(guest, 'poll:close', { ...target, senderId: profiles[0].userId }, 'POLL_HOST_REQUIRED');
  assertPoll(await accepted(host, 'poll:vote', target), [1, 0], target.optionId);
});

test('live poll updates reveal only the viewer ballot and stable identities count once across connections', { timeout: 10000 }, async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const guest = await connect(profiles[1]);
  const guestOtherTab = await connect(profiles[1]);
  const observer = await connect(profiles[2]);
  await Promise.all([host, guest, guestOtherTab, observer].map((socket) => join(socket)));
  const source = await createPoll(host);
  const [first, second] = source.poll.options;
  const target = { roomId: source.roomId, messageId: source.id };
  await accepted(host, 'poll:vote', { ...target, optionId: first.id });
  const voted = await accepted(guest, 'poll:vote', { ...target, optionId: first.id });
  assertPoll(voted, [2, 0], first.id);
  const revised = await accepted(guestOtherTab, 'poll:vote', { ...target, optionId: second.id });
  assertPoll(revised, [1, 1], second.id);
  assert.ok(revised.pollRevision > voted.pollRevision);

  for (const [socket, selection] of [[host, first.id], [guest, second.id], [guestOtherTab, second.id], [observer, undefined]]) {
    const broadcast = await waitForMessage(socket, (message) => message.id === source.id && message.pollRevision === revised.pollRevision);
    assertPoll(broadcast, [1, 1], selection);
    assertPoll(await accepted(socket, 'poll:get', target), [1, 1], selection);
    const history = await accepted(socket, 'chat:history', { roomId: source.roomId });
    assertPoll(history.messages.find((message) => message.id === source.id), [1, 1], selection);
  }
  const repeated = await accepted(guest, 'poll:vote', { ...target, optionId: second.id });
  assertPoll(repeated, [1, 1], second.id);
});

test('manual close broadcasts one final result and reconnect restores the result and personal choice', { timeout: 10000 }, async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const guest = await connect(profiles[1]);
  await Promise.all([join(host), join(guest)]);
  const source = await createPoll(host);
  const target = { roomId: source.roomId, messageId: source.id };
  const chosen = source.poll.options[1].id;
  await accepted(guest, 'poll:vote', { ...target, optionId: chosen });
  const closed = await accepted(host, 'poll:close', target);
  assert.equal(closed.id, source.id);
  assert.equal(closed.poll.status, 'closed');
  assert.equal(closed.poll.closeReason, 'manual');
  assert.ok(closed.poll.closedAt);
  assertPoll(closed, [0, 1], undefined);
  for (const [socket, selected] of [[host, undefined], [guest, chosen]]) {
    const update = await waitForMessage(socket, (message) => message.id === source.id && message.poll.status === 'closed');
    assertPoll(update, [0, 1], selected);
    const result = await waitForMessage(socket, (message) => message.type === 'poll-result');
    assert.equal(result.pollSourceId, source.id);
    assert.deepEqual(result.poll.options.map((option) => option.count), [0, 1]);
    assert.equal(result.poll.totalVotes, 1);
    assert.equal(result.poll.status, 'closed');
    assertNoPrivateVotes(result);
  }

  const repeated = await accepted(host, 'poll:close', target);
  assert.equal(repeated.pollRevision, closed.pollRevision);
  await rejected(guest, 'poll:vote', { ...target, optionId: source.poll.options[0].id }, 'POLL_CLOSED');
  const history = await accepted(guest, 'chat:history', { roomId: source.roomId });
  assert.equal(history.messages.filter((message) => message.type === 'poll-result').length, 1);
  const resultMessage = history.messages.find((message) => message.type === 'poll-result');
  const openedResult = await accepted(guest, 'poll:get', { roomId: source.roomId, messageId: resultMessage.id });
  assert.equal(openedResult.id, source.id);
  assertPoll(openedResult, [0, 1], chosen);
  for (const socket of [host, guest]) assert.equal(socket.receivedMessages.filter((message) => message.type === 'poll-result').length, 1);
  guest.disconnect();
  const reconnected = await connect(profiles[1]);
  const joined = await join(reconnected);
  assertPoll(joined.messages.find((message) => message.id === source.id), [0, 1], chosen);
  assert.equal(joined.messages.filter((message) => message.type === 'poll-result').length, 1);
  assert.equal((await accepted(reconnected, 'poll:get', target)).poll.status, 'closed');
});

test('the deadline scheduler pushes final counts without client activity', { timeout: 10000 }, async (t) => {
  const { connect } = await fixture(t);
  const host = await connect();
  const guest = await connect(profiles[1]);
  await Promise.all([join(host), join(guest)]);
  const source = await createPoll(host, { deadlineAt: Date.now() + 1500 });
  const target = { roomId: source.roomId, messageId: source.id };
  await accepted(guest, 'poll:vote', { ...target, optionId: source.poll.options[0].id });
  // 投票后停止发送请求，验证截止任务会主动推送结果。
  const result = await waitForMessage(guest, (message) => message.type === 'poll-result');
  assert.equal(result.poll.closeReason, 'deadline');
  assert.equal(result.poll.totalVotes, 1);
  const update = await waitForMessage(guest, (message) => message.id === source.id && message.poll.status === 'closed');
  assertPoll(update, [1, 0], source.poll.options[0].id);
  assert.equal(update.poll.closeReason, 'deadline');
  await waitForMessage(host, (message) => message.type === 'poll-result');
  const history = await accepted(guest, 'chat:history', { roomId: source.roomId });
  assert.equal(history.messages.filter((message) => message.type === 'poll-result').length, 1);
});

test('starting the scheduler recovers overdue persisted polls and retains ballots across server restart', { timeout: 10000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-poll-restart-'));
  let first;
  let restarted;
  t.after(async () => {
    await first?.stop();
    await restarted?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  first = await fixture(t, { directory, scheduler: false });
  const host = await first.connect();
  const guest = await first.connect(profiles[1]);
  await Promise.all([join(host), join(guest)]);
  const deadlineAt = Date.now() + 1500;
  const source = await createPoll(host, { deadlineAt });
  const target = { roomId: source.roomId, messageId: source.id };
  const chosen = source.poll.options[1].id;
  await accepted(guest, 'poll:vote', { ...target, optionId: chosen });
  await first.stop();
  await delay(Math.max(0, deadlineAt - Date.now()) + 50);

  restarted = await fixture(t, { directory });
  const reconnected = await restarted.connect(profiles[1]);
  const joined = await join(reconnected);
  const restored = joined.messages.find((message) => message.id === source.id);
  assertPoll(restored, [0, 1], chosen);
  assert.equal(restored.poll.status, 'closed');
  assert.equal(restored.poll.closeReason, 'deadline');
  assert.equal(joined.messages.filter((message) => message.type === 'poll-result').length, 1);
  assert.equal((await accepted(reconnected, 'poll:get', target)).poll.status, 'closed');
});
