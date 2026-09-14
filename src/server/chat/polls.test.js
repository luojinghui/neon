const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CHAT_DATA_VERSION, RoomRepository } = require('./roomRepository');

const host = { id: 'guest-private-host', userId: 'Host01', publicKey: 'host-public', name: '发起星友', avatarUrl: '/host.png' };
const guest = { id: 'guest-private-guest', userId: 'Guest01', publicKey: 'guest-public', name: '参与星友' };
const third = { id: 'guest-private-third', userId: 'Third01', publicKey: 'third-public', name: '第三位星友' };
const question = { question: '周末去哪里？', options: ['公园', '博物馆', '咖啡馆'] };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-chat-polls-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const repository = new RoomRepository({ dataFile });
  const room = repository.createRoom({ name: '投票星球', tags: [] }, host);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.after(async () => {
    await repository.writeQueue;
    await repository.cleanupQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { repository, roomId: room.id, dataFile, advance: (milliseconds = 1000) => { now += milliseconds; } };
}

function assertNoPrivateIdentity(value) {
  const json = JSON.stringify(value);
  for (const secret of ['_pollPrivate', 'hostId', 'votes', host.id, guest.id, third.id]) {
    assert.equal(json.includes(secret), false, `private data leaked: ${secret}`);
  }
}

test('polls validate one bounded question, two to ten distinct options and future deadlines', (t) => {
  const { repository, roomId } = fixture(t);
  for (const value of [null, {}, '', ' '.repeat(4), '题'.repeat(201), 'A\u0000B']) {
    assert.throws(() => repository.createPoll(roomId, host, { ...question, question: value }), { code: 'POLL_QUESTION_INVALID' });
  }
  for (const options of [null, {}, [], ['唯一'], new Array(11).fill('选项'), [' A ', 'A'], ['a', ' '], ['a', 1], ['a', '字'.repeat(101)]]) {
    assert.throws(() => repository.createPoll(roomId, host, { ...question, options }), { code: 'POLL_OPTIONS_INVALID' });
  }
  for (const deadlineAt of [null, '9999999999999', Date.now(), Date.now() - 1, NaN, Infinity, 8.64e15 + 1]) {
    assert.throws(() => repository.createPoll(roomId, host, { ...question, deadlineAt }), { code: 'POLL_DEADLINE_INVALID' });
  }
  const valid = repository.createPoll(roomId, host, { question: ` ${'🐱'.repeat(200)} `, options: [` ${'🌲'.repeat(100)} `, '博物馆'], deadlineAt: Date.now() + 1 });
  assert.equal(valid.poll.question, '🐱'.repeat(200));
  assert.equal(valid.poll.options[0].text, '🌲'.repeat(100));
  assert.equal(valid.poll.options[0].count, 0);
  assert.equal(valid.poll.totalVotes, 0);
  assert.equal(valid.pollRevision, 0);
  assert.equal(valid.poll.status, 'open');
  assert.equal(valid.senderId, host.userId);
  assert.equal(valid.senderAvatar, host.avatarUrl);
  assert.notEqual(valid.poll.options[0].id, valid.poll.options[1].id);
  assertNoPrivateIdentity(valid);
  assert.throws(() => repository.createPoll('missing', host, question), { code: 'ROOM_NOT_FOUND' });
  assert.throws(() => repository.createPoll(roomId, null, question), /用户身份/);
});

test('the host can vote, all viewers receive aggregate counts and a changed answer replaces its previous vote', (t) => {
  const { repository, roomId } = fixture(t);
  const source = repository.createPoll(roomId, host, question);
  const [first, second] = source.poll.options;
  const ownVote = repository.votePoll(roomId, source.id, host, { optionId: first.id });
  assert.equal(ownVote.poll.selectedOptionId, first.id);
  assert.equal(ownVote.poll.totalVotes, 1);
  repository.votePoll(roomId, source.id, guest, { optionId: first.id });
  repository.votePoll(roomId, source.id, third, { optionId: second.id });
  const changed = repository.votePoll(roomId, source.id, { ...host, userId: 'RenamedHost', publicKey: 'new-public-key', name: '新名字' }, { optionId: second.id });
  assert.deepEqual(changed.poll.options.map((option) => option.count), [1, 2, 0]);
  assert.equal(changed.poll.totalVotes, 3);
  assert.equal(changed.pollRevision, 4);
  assert.equal(changed.poll.selectedOptionId, second.id);
  assert.equal(repository.getPoll(roomId, source.id, guest).poll.selectedOptionId, first.id);
  assert.equal(repository.getHistory(roomId, { user: host }).messages.at(-1).poll.selectedOptionId, second.id);
  assert.equal(repository.getHistory(roomId, { user: guest }).messages.at(-1).poll.selectedOptionId, first.id);
  const publicSnapshot = repository.getHistory(roomId).messages.at(-1);
  assert.equal('selectedOptionId' in publicSnapshot.poll, false);
  assertNoPrivateIdentity(publicSnapshot);
  const repeat = repository.votePoll(roomId, source.id, host, { optionId: second.id });
  assert.equal(repeat.pollRevision, 4);
  assert.equal(repeat.poll.totalVotes, 3);
});

test('untrusted counts, identities, status and poll payloads cannot alter server state', (t) => {
  const { repository, roomId } = fixture(t);
  for (const type of ['poll', 'poll-result']) {
    assert.throws(() => repository.addMessage(roomId, host, { type, content: '伪造投票', poll: question }), { code: 'POLL_CREATE_REQUIRED' });
  }
  const source = repository.createPoll(roomId, host, { ...question, senderId: guest.userId, pollRevision: 999, _pollPrivate: { hostId: guest.id }, poll: { status: 'closed', totalVotes: 999 } });
  assert.equal(source.pollRevision, 0);
  assert.equal(source.poll.status, 'open');
  assert.equal(source.poll.totalVotes, 0);
  assert.equal(source.senderId, host.userId);
  const selected = source.poll.options[0].id;
  const voted = repository.votePoll(roomId, source.id, guest, { optionId: selected, actorId: host.id, count: 999, status: 'closed', votes: { fake: selected } });
  assert.equal(voted.poll.totalVotes, 1);
  assert.equal(voted.poll.status, 'open');
  voted.poll.options[0].count = 500;
  voted.poll.options[0].text = '改写';
  voted.poll.options.push({ id: 'fake', text: '假选项', count: 500 });
  source.poll.question = '改写问题';
  const current = repository.getPoll(roomId, source.id, host);
  assert.equal(current.poll.options.length, 3);
  assert.equal(current.poll.options[0].count, 1);
  assert.equal(current.poll.options[0].text, question.options[0]);
  assert.equal(current.poll.question, question.question);
  assert.equal('selectedOptionId' in current.poll, false);
  assertNoPrivateIdentity(current);
});

test('votes require a valid same-room source and valid option ID', (t) => {
  const { repository, roomId } = fixture(t);
  const source = repository.createPoll(roomId, host, question);
  for (const optionId of [undefined, null, {}, 1, '', 'missing']) {
    assert.throws(() => repository.votePoll(roomId, source.id, guest, { optionId }), { code: 'POLL_OPTION_INVALID' });
  }
  assert.throws(() => repository.votePoll('soul-harbor', source.id, guest, { optionId: source.poll.options[0].id }), { code: 'POLL_NOT_FOUND' });
  assert.throws(() => repository.getPoll(roomId, 'missing', guest), { code: 'POLL_NOT_FOUND' });
  const text = repository.addMessage(roomId, guest, { content: '普通消息' });
  assert.throws(() => repository.votePoll(roomId, text.id, guest, { optionId: source.poll.options[0].id }), { code: 'POLL_NOT_FOUND' });
  assert.equal(repository.getPoll(roomId, source.id).pollRevision, 0);
});

test('only the stable host identity can close a poll, yielding one immutable result message', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, question);
  repository.votePoll(roomId, source.id, host, { optionId: source.poll.options[0].id });
  assert.throws(() => repository.closePoll(roomId, source.id, guest), { code: 'POLL_HOST_REQUIRED' });
  assert.throws(() => repository.closePoll(roomId, source.id, { ...guest, userId: host.userId, publicKey: host.publicKey }), { code: 'POLL_HOST_REQUIRED' });
  advance();
  const result = repository.closePoll(roomId, source.id, { ...host, userId: 'RenamedHost', name: '新名字' });
  assert.equal(result.created, true);
  assert.equal(result.message.poll.status, 'closed');
  assert.equal(result.message.poll.closeReason, 'manual');
  assert.equal(result.message.poll.closedAt, Date.now());
  assert.equal(result.message.pollRevision, 2);
  assert.equal(result.resultMessage.type, 'poll-result');
  assert.equal(result.resultMessage.pollSourceId, source.id);
  assert.equal(result.resultMessage.senderId, host.userId);
  assert.equal(result.resultMessage.senderKey, host.publicKey);
  assert.equal(result.resultMessage.senderAvatar, host.avatarUrl);
  assert.deepEqual(result.resultMessage.poll.options, result.message.poll.options);
  assert.equal(repository.getPoll(roomId, result.resultMessage.id, host).id, source.id);
  assert.equal(repository.getPoll(roomId, result.resultMessage.id, host).poll.selectedOptionId, source.poll.options[0].id);
  advance();
  const repeated = repository.closePoll(roomId, source.id, host);
  assert.equal(repeated.created, false);
  assert.deepEqual(repeated.message, result.message);
  assert.deepEqual(repeated.resultMessage, result.resultMessage);
  assert.equal(repository.getHistory(roomId).messages.filter((message) => message.type === 'poll-result').length, 1);
  assert.throws(() => repository.votePoll(roomId, source.id, host, { optionId: source.poll.options[1].id }), { code: 'POLL_CLOSED' });
  assert.throws(() => repository.closePoll(roomId, source.id, guest), { code: 'POLL_HOST_REQUIRED' });
  assertNoPrivateIdentity(result);
});

test('the server rejects a late vote before the scheduler runs and settles deadlines exactly once', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const deadlineAt = Date.now() + 1000;
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt });
  repository.votePoll(roomId, source.id, guest, { optionId: source.poll.options[1].id });
  advance(999);
  assert.deepEqual(repository.closeExpiredPolls(), []);
  advance(1);
  assert.throws(() => repository.votePoll(roomId, source.id, guest, { optionId: source.poll.options[0].id }), { code: 'POLL_CLOSED' });
  advance(5000);
  const [result] = repository.closeExpiredPolls();
  assert.equal(result.created, true);
  assert.equal(result.message.poll.closedAt, deadlineAt);
  assert.equal(result.message.poll.closeReason, 'deadline');
  assert.equal(result.message.poll.totalVotes, 1);
  assert.equal(result.message.poll.options[1].count, 1);
  assert.equal(result.resultMessage.timestamp, Date.now());
  assert.equal('selectedOptionId' in result.resultMessage.poll, false);
  assert.equal('selectedOptionId' in result.message.poll, false);
  assertNoPrivateIdentity(result);
  assert.deepEqual(repository.closeExpiredPolls(), []);
  assert.equal(repository.closePoll(roomId, source.id, host).created, false);
  assert.equal(repository.getHistory(roomId).messages.filter((message) => message.type === 'poll-result').length, 1);
});

test('a host ending an expired poll preserves the deadline close reason', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt: Date.now() + 1 });
  advance();
  const result = repository.closePoll(roomId, source.id, host);
  assert.equal(result.message.poll.closeReason, 'deadline');
  assert.equal(result.message.poll.closedAt, source.poll.deadlineAt);
  assert.deepEqual(repository.closeExpiredPolls(), []);
});

test('concurrent answers and manual/deadline completion produce consistent totals and one final result', async (t) => {
  const { repository, roomId, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt: Date.now() + 1000 });
  await Promise.all([host, guest, third].map((actor, index) => Promise.resolve().then(() => repository.votePoll(roomId, source.id, actor, { optionId: source.poll.options[index % 2].id }))));
  const answers = repository.getPoll(roomId, source.id);
  assert.equal(answers.pollRevision, 3);
  assert.deepEqual(answers.poll.options.map((option) => option.count), [2, 1, 0]);
  advance();
  const results = await Promise.all([
    Promise.resolve().then(() => repository.closePoll(roomId, source.id, host)),
    Promise.resolve().then(() => repository.closeExpiredPolls()),
    Promise.resolve().then(() => repository.closePoll(roomId, source.id, host))
  ]);
  assert.equal(results.flat().filter((result) => result.created).length, 1);
  assert.equal(repository.getPoll(roomId, source.id).pollRevision, 4);
  assert.equal(repository.getHistory(roomId).messages.filter((message) => message.type === 'poll-result').length, 1);
});

test('pending votes and deadlines survive restart, including elapsed deadlines and idempotent result publication', async (t) => {
  const { repository, roomId, dataFile, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt: Date.now() + 1000 });
  repository.votePoll(roomId, source.id, guest, { optionId: source.poll.options[1].id });
  await repository.writeQueue;
  const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(stored.version, CHAT_DATA_VERSION);
  assert.equal(stored.version, 2);
  const privatePoll = stored.messages.find((message) => message.id === source.id);
  assert.equal(privatePoll._pollPrivate.hostId, host.id);
  assert.equal(privatePoll._pollPrivate.votes[guest.id], source.poll.options[1].id);
  advance(2000);
  const restarted = new RoomRepository({ dataFile });
  const [result] = restarted.closeExpiredPolls();
  assert.equal(result.message.poll.totalVotes, 1);
  assert.equal(result.message.poll.closeReason, 'deadline');
  assert.equal(restarted.getPoll(roomId, source.id, guest).poll.selectedOptionId, source.poll.options[1].id);
  assertNoPrivateIdentity(restarted.getHistory(roomId, { user: guest }));
  await restarted.writeQueue;
  const restartedAgain = new RoomRepository({ dataFile });
  assert.deepEqual(restartedAgain.closeExpiredPolls(), []);
  assert.equal(restartedAgain.closePoll(roomId, source.id, host).created, false);
  assert.equal(restartedAgain.getHistory(roomId).messages.filter((message) => message.type === 'poll-result').length, 1);
  assert.deepEqual(restartedAgain.getPoll(roomId, result.resultMessage.id).poll, result.message.poll);
  await restartedAgain.writeQueue;
});

test('result messages survive profile resolution and refresh sender details at startup', async (t) => {
  const { repository, dataFile } = fixture(t);
  const roomId = 'soul-harbor';
  const source = repository.createPoll(roomId, host, question);
  const result = repository.closePoll(roomId, source.id, host);
  await repository.writeQueue;
  const profile = { uuid: 'private-host', userId: host.userId, publicKey: host.publicKey, name: '更新的名字', avatarUrl: '/new-avatar.png' };
  const restarted = new RoomRepository({ dataFile, resolveProfile: () => profile });
  try {
    assert.equal(restarted.getPoll(roomId, result.resultMessage.id).poll.status, 'closed');
    const history = restarted.getHistory(roomId).messages;
    assert.equal(history.filter((message) => message.type === 'poll-result').length, 1);
    assert.equal(history.find((message) => message.id === result.resultMessage.id).senderName, profile.name);
    assert.equal(history.find((message) => message.id === result.resultMessage.id).senderAvatar, profile.avatarUrl);
  } finally {
    await restarted.writeQueue;
  }
});

test('final result snapshots can be opened after source deletion and are never republished after result deletion', (t) => {
  const { repository, roomId } = fixture(t);
  const first = repository.createPoll(roomId, host, question);
  repository.votePoll(roomId, first.id, guest, { optionId: first.poll.options[0].id });
  const firstResult = repository.closePoll(roomId, first.id, host);
  const deleted = repository.deleteMessage(roomId, first.id, host);
  assertNoPrivateIdentity(deleted);
  const snapshot = repository.getPoll(roomId, firstResult.resultMessage.id, guest);
  assert.equal(snapshot.type, 'poll-result');
  assert.equal(snapshot.poll.status, 'closed');
  assert.equal(snapshot.poll.totalVotes, 1);
  assert.equal('selectedOptionId' in snapshot.poll, false);
  assert.deepEqual(repository.getPoll(roomId, first.id, guest), snapshot);
  const second = repository.createPoll(roomId, host, question);
  const secondResult = repository.closePoll(roomId, second.id, host);
  repository.deleteMessage(roomId, secondResult.resultMessage.id, host);
  const repeat = repository.closePoll(roomId, second.id, host);
  assert.equal(repeat.created, false);
  assert.deepEqual(repeat.resultMessage, secondResult.resultMessage);
  assert.equal(repository.getStoredMessage(roomId, secondResult.resultMessage.id), null);
});

test('open polls survive history retention, still accept answers, and publish a readable final result', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt: Date.now() + 1000 });
  const messages = repository.messages.get(roomId);
  for (let index = 0; index < 5000; index += 1) {
    messages.push({ id: `filler-${index}`, roomId, type: 'text', content: '后续消息', timestamp: Date.now() + index, senderId: guest.userId, senderKey: guest.publicKey, senderName: guest.name });
  }
  repository.addMessage(roomId, guest, { content: '最新消息' });
  assert.equal(repository.messages.get(roomId).length, 5000);
  repository.votePoll(roomId, source.id, guest, { optionId: source.poll.options[0].id });
  advance(6000);
  const [result] = repository.closeExpiredPolls();
  assert.equal(result.message.poll.totalVotes, 1);
  assert.equal(repository.getPoll(roomId, result.resultMessage.id).poll.status, 'closed');
  assert.ok(repository.getStoredMessage(roomId, result.resultMessage.id));
  assert.ok(repository.getStoredMessage(roomId, source.id));
});

test('batch settlement keeps every source available for broadcasting and old source IDs resolve final snapshots after later retention', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const deadlineAt = Date.now() + 1000;
  const first = repository.createPoll(roomId, host, { ...question, deadlineAt });
  const second = repository.createPoll(roomId, host, { ...question, deadlineAt });
  repository.votePoll(roomId, first.id, guest, { optionId: first.poll.options[0].id });
  repository.votePoll(roomId, second.id, host, { optionId: second.poll.options[1].id });
  const messages = repository.messages.get(roomId);
  for (let index = 0; index < 4998; index += 1) {
    messages.push({ id: `filler-${index}`, roomId, type: 'text', content: '后续消息', timestamp: Date.now(), senderId: third.userId, senderKey: third.publicKey, senderName: third.name });
  }
  advance();
  const results = repository.closeExpiredPolls();
  assert.equal(results.length, 2);
  assert.equal(repository.messages.get(roomId).length, 5000);
  for (const result of results) {
    const storedSource = repository.getStoredMessage(roomId, result.message.id);
    const storedResult = repository.getStoredMessage(roomId, result.resultMessage.id);
    assert.ok(storedSource);
    assert.ok(storedResult);
    assert.equal(storedSource.poll.status, 'closed');
    assert.equal(storedResult.poll.totalVotes, 1);
    assert.deepEqual(repository.toPublicMessage(storedSource).poll, result.message.poll);
  }
  repository.addMessage(roomId, third, { content: '结算后的新消息' });
  assert.equal(repository.getStoredMessage(roomId, first.id), null);
  const snapshot = repository.getPoll(roomId, first.id, guest);
  assert.equal(snapshot.id, results[0].resultMessage.id);
  assert.equal(snapshot.pollSourceId, first.id);
  assert.equal(snapshot.poll.status, 'closed');
  assert.equal(snapshot.poll.options[0].count, 1);
  assert.equal('selectedOptionId' in snapshot.poll, false);
  assertNoPrivateIdentity(snapshot);
  assert.deepEqual(repository.closeExpiredPolls(), []);
  assert.throws(() => repository.getPoll('soul-harbor', first.id, guest), { code: 'POLL_NOT_FOUND' });
});

test('deleting a poll, its host or its room cancels any pending settlement and conceals private votes', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const source = repository.createPoll(roomId, host, { ...question, deadlineAt: Date.now() + 1000 });
  repository.votePoll(roomId, source.id, guest, { optionId: source.poll.options[0].id });
  repository.deleteRoom(roomId, host);
  advance();
  assert.deepEqual(repository.closeExpiredPolls(), []);
  assert.equal(repository.messages.has(roomId), false);
  assert.throws(() => repository.getPoll(roomId, source.id), { code: 'ROOM_NOT_FOUND' });
  const deletedSource = repository.createPoll('soul-harbor', host, { ...question, deadlineAt: Date.now() + 1000 });
  assertNoPrivateIdentity(repository.deleteMessage('soul-harbor', deletedSource.id, null, { isAdmin: true }));
  const removedHost = repository.createPoll('soul-harbor', host, { ...question, deadlineAt: Date.now() + 1000 });
  repository.votePoll('soul-harbor', removedHost.id, guest, { optionId: removedHost.poll.options[0].id });
  const deletedData = repository.deleteUserData({ publicKey: host.publicKey, userId: host.userId });
  assertNoPrivateIdentity(deletedData);
  advance();
  assert.deepEqual(repository.closeExpiredPolls(), []);
});
