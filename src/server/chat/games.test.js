const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CHAT_DATA_VERSION, RoomRepository } = require('./roomRepository');

const strokes = [{ color: '#FFAA00', width: 4, points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.8 }] }];
const host = { id: 'guest-private-host', userId: 'Host01', publicKey: 'host-public', name: '画画星友' };
const guest = { id: 'guest-private-guest', userId: 'Guest01', publicKey: 'guest-public', name: '猜画星友' };
const third = { id: 'guest-private-third', userId: 'Third01', publicKey: 'third-public', name: '第三位星友' };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-chat-games-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const repository = new RoomRepository({ dataFile });
  const room = repository.createRoom({ name: '游戏星球', tags: [] }, host);
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
  assert.equal(json.includes('_gamePrivate'), false);
  assert.equal(json.includes(host.id), false);
  assert.equal(json.includes(guest.id), false);
  assert.equal(json.includes(third.id), false);
}

test('quick replies use an authentic same-room sender and a bounded snapshot', (t) => {
  const { repository, roomId } = fixture(t);
  const source = repository.addMessage(roomId, host, { type: 'text', content: '🐱'.repeat(200) });
  const reply = repository.addMessage(roomId, guest, {
    type: 'text', content: '🥰', replyToId: source.id,
    replyTo: { id: 'forged', senderName: '冒充名字', content: '冒充内容' }, senderId: host.userId
  });
  assert.equal(reply.senderId, guest.userId);
  assert.deepEqual(reply.replyTo, { id: source.id, senderName: host.name, content: '🐱'.repeat(160), type: 'text' });
  assert.throws(() => repository.addMessage(roomId, { ...host, userId: 'NewHostName' }, { content: '😊', replyToId: source.id }), { code: 'REPLY_SELF_NOT_ALLOWED' });
  assert.throws(() => repository.addMessage(roomId, guest, { content: '😊', replyToId: 'missing' }), { code: 'REPLY_NOT_FOUND' });
  assert.throws(() => repository.addMessage(roomId, guest, { content: '😊', replyToId: {} }), { code: 'REPLY_INVALID' });
  const another = repository.createRoom({ name: '另一颗星球' }, guest);
  assert.throws(() => repository.addMessage(another.id, guest, { content: '😊', replyToId: source.id }), { code: 'REPLY_NOT_FOUND' });
  reply.replyTo.content = 'client mutation';
  assert.equal(repository.getHistory(roomId).messages.at(-1).replyTo.content, '🐱'.repeat(160));
});

test('attachment and game reply previews remain useful without leaking hidden game data', (t) => {
  const { repository, roomId } = fixture(t);
  const image = repository.addMessage(roomId, host, {
    type: 'image', attachment: { url: '/uploads/soul/11111111-1111-4111-8111-111111111111.png', name: '小猫.png', size: 100, mimeType: 'image/png' }
  });
  assert.equal(repository.addMessage(roomId, guest, { content: '🥰', replyToId: image.id }).replyTo.content, '[图片]');
  const drawing = repository.createGame(roomId, host, { kind: 'draw', word: '向日葵', strokes });
  const reply = repository.addMessage(roomId, guest, { content: '🐱', replyToId: drawing.id });
  assert.equal(reply.replyTo.type, 'game');
  assert.equal(reply.replyTo.content, '🎨 来猜猜我画的是什么');
  assert.equal(JSON.stringify(reply).includes('向日葵'), false);
  repository.deleteMessage(roomId, image.id, host);
  assert.throws(() => repository.addMessage(roomId, guest, { content: '🥰', replyToId: image.id }), { code: 'REPLY_NOT_FOUND' });
});

test('dice results are server-generated, immutable game messages and cannot be sent as text payloads', (t) => {
  const { repository, roomId, advance } = fixture(t);
  for (let i = 0; i < 20; i += 1) {
    const message = repository.createGame(roomId, host, { kind: 'dice', value: 999, game: { kind: 'dice', value: 999 }, senderId: guest.userId, gameRevision: 50 });
    assert.equal(message.type, 'game');
    assert.equal(message.senderId, host.userId);
    assert.equal(message.gameRevision, 0);
    assert.ok(Number.isInteger(message.game.value) && message.game.value >= 1 && message.game.value <= 6);
    assertNoPrivateIdentity(message);
    assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'join' }), { code: 'GAME_ACTION_INVALID' });
    advance();
  }
  assert.throws(() => repository.addMessage(roomId, host, { type: 'game', content: 'fake', game: { kind: 'dice', value: 6 } }), { code: 'GAME_CREATE_REQUIRED' });
  const text = repository.addMessage(roomId, host, { type: 'text', content: 'fake', game: { kind: 'dice', value: 6 } });
  assert.equal('game' in text, false);
  assert.throws(() => repository.createGame(roomId, host, { kind: 'unsupported' }), { code: 'GAME_KIND_INVALID' });
  assert.throws(() => repository.createGame(roomId, null, { kind: 'dice' }), /用户身份/);
  assert.throws(() => repository.createGame('missing', host, { kind: 'dice' }), { code: 'ROOM_NOT_FOUND' });
});

test('rps conceals the host choice in acknowledgements, history and deletion responses', (t) => {
  const { repository, roomId } = fixture(t);
  const message = repository.createGame(roomId, host, { kind: 'rps', choice: 'scissors' });
  assert.deepEqual(message.game, { kind: 'rps', status: 'waiting' });
  assertNoPrivateIdentity(message);
  const history = repository.getHistory(roomId).messages;
  assert.equal(JSON.stringify(history).includes('scissors'), false);
  assertNoPrivateIdentity(history);
  const deleted = repository.deleteMessage(roomId, message.id, host);
  assert.equal(JSON.stringify(deleted).includes('scissors'), false);
  assertNoPrivateIdentity(deleted);
});

test('rps computes every matchup on the server and exposes only public player identities', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const expected = {
    rock: { rock: 'draw', paper: 'guest', scissors: 'host' },
    paper: { rock: 'host', paper: 'draw', scissors: 'guest' },
    scissors: { rock: 'guest', paper: 'host', scissors: 'draw' }
  };
  for (const hostChoice of Object.keys(expected)) {
    for (const guestChoice of Object.keys(expected)) {
      const message = repository.createGame(roomId, host, { kind: 'rps', choice: hostChoice });
      const result = repository.actOnGame(roomId, message.id, guest, {
        action: 'join', choice: guestChoice, hostChoice: 'fake', winner: 'guest', guest: { userId: host.userId }
      });
      assert.equal(result.id, message.id);
      assert.equal(result.timestamp, message.timestamp);
      assert.equal(result.gameRevision, 1);
      assert.equal(result.game.status, 'completed');
      assert.equal(result.game.hostChoice, hostChoice);
      assert.equal(result.game.winner, expected[hostChoice][guestChoice]);
      assert.deepEqual(result.game.guest, { userId: guest.userId, publicKey: guest.publicKey, name: guest.name, choice: guestChoice });
      assertNoPrivateIdentity(result);
      assert.throws(() => repository.actOnGame(roomId, message.id, third, { action: 'join', choice: 'rock' }), { code: 'GAME_ENDED' });
      assert.throws(() => repository.actOnGame(roomId, message.id, host, { action: 'finish' }), { code: 'GAME_ENDED' });
      advance();
    }
  }
});

test('rps requires valid choices, excludes its host and allows only its host to cancel', (t) => {
  const { repository, roomId } = fixture(t);
  assert.throws(() => repository.createGame(roomId, host, { kind: 'rps', choice: 'water' }), { code: 'GAME_CHOICE_INVALID' });
  const message = repository.createGame(roomId, host, { kind: 'rps', choice: 'rock' });
  assert.throws(() => repository.actOnGame(roomId, message.id, host, { action: 'join', choice: 'paper' }), { code: 'GAME_SELF_JOIN' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'join', choice: 'water' }), { code: 'GAME_CHOICE_INVALID' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'finish' }), { code: 'GAME_HOST_REQUIRED' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '石头' }), { code: 'GAME_ACTION_INVALID' });
  assert.throws(() => repository.actOnGame('soul-harbor', message.id, guest, { action: 'join', choice: 'paper' }), { code: 'GAME_NOT_FOUND' });
  const cancelled = repository.actOnGame(roomId, message.id, { ...host, userId: 'RenamedHost' }, { action: 'finish' });
  assert.deepEqual(cancelled.game, { kind: 'rps', status: 'cancelled' });
  assert.equal(cancelled.gameRevision, 1);
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'join', choice: 'paper' }), { code: 'GAME_ENDED' });
});

test('simultaneous rps challengers produce exactly one guest and one revision', async (t) => {
  const { repository, roomId } = fixture(t);
  const message = repository.createGame(roomId, host, { kind: 'rps', choice: 'rock' });
  const attempts = await Promise.allSettled([guest, third].map((player) => Promise.resolve().then(() => repository.actOnGame(roomId, message.id, player, { action: 'join', choice: 'paper' }))));
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.find((attempt) => attempt.status === 'rejected').reason.code, 'GAME_ENDED');
  const stored = repository.getHistory(roomId).messages.at(-1);
  assert.equal(stored.gameRevision, 1);
  assert.equal(stored.game.guest.publicKey, attempts.find((attempt) => attempt.status === 'fulfilled').value.game.guest.publicKey);
});

test('draw keeps the answer private until another player guesses it and retains wrong guesses', (t) => {
  const { repository, roomId } = fixture(t);
  const message = repository.createGame(roomId, host, { kind: 'draw', word: '向日葵', strokes });
  assert.equal(message.game.wordLength, 3);
  assert.equal('answer' in message.game, false);
  assert.equal(JSON.stringify(repository.getHistory(roomId)).includes('向日葵'), false);
  assertNoPrivateIdentity(message);
  message.game.strokes[0].points[0].x = 0.99;
  const wrong = repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '小猫咪', correct: true, answer: '小猫咪', winnerName: 'fake' });
  assert.equal(wrong.game.status, 'playing');
  assert.equal(wrong.game.guesses[0].correct, false);
  assert.equal(wrong.game.strokes[0].points[0].x, 0.2);
  assert.equal('answer' in wrong.game, false);
  assert.equal(wrong.gameRevision, 1);
  const correct = repository.actOnGame(roomId, message.id, third, { action: 'guess', guess: '向 日 葵' });
  assert.equal(correct.game.status, 'completed');
  assert.equal(correct.game.answer, '向日葵');
  assert.equal(correct.game.winnerName, third.name);
  assert.equal(correct.game.guesses.length, 2);
  assert.equal(correct.game.guesses[1].correct, true);
  assert.equal(correct.gameRevision, 2);
  assertNoPrivateIdentity(correct);
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '向日葵' }), { code: 'GAME_ENDED' });
  assert.throws(() => repository.actOnGame(roomId, message.id, host, { action: 'finish' }), { code: 'GAME_ENDED' });
});

test('draw host can reveal, cannot guess and other players cannot reveal', (t) => {
  const { repository, roomId } = fixture(t);
  const message = repository.createGame(roomId, host, { kind: 'draw', word: '小太阳', strokes });
  assert.throws(() => repository.actOnGame(roomId, message.id, host, { action: 'guess', guess: '小太阳' }), { code: 'GAME_SELF_GUESS' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'finish' }), { code: 'GAME_HOST_REQUIRED' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'join' }), { code: 'GAME_ACTION_INVALID' });
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: 'a'.repeat(41) }), { code: 'GAME_TEXT_INVALID' });
  const revealed = repository.actOnGame(roomId, message.id, { ...host, userId: 'RenamedHost', name: '新名字' }, { action: 'finish' });
  assert.equal(revealed.game.status, 'completed');
  assert.equal(revealed.game.answer, '小太阳');
  assert.equal('winnerName' in revealed.game, false);
});

test('draw validates nonempty bounded strokes, coordinates, brush properties and answer length', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const invalidDrawings = [
    [], null, new Array(121).fill(strokes[0]),
    [{ ...strokes[0], color: 'url(javascript:bad)' }],
    [{ ...strokes[0], width: 17 }], [{ ...strokes[0], width: NaN }], [{ ...strokes[0], width: '4' }],
    [{ ...strokes[0], points: [] }], [{ ...strokes[0], points: new Array(501).fill({ x: 0.2, y: 0.3 }) }],
    [{ ...strokes[0], points: [{ x: Infinity, y: 0.1 }] }],
    [{ ...strokes[0], points: [{ x: 1.01, y: 0.1 }] }],
    [{ ...strokes[0], points: [{ x: '0.1', y: 0.1 }] }]
  ];
  for (const invalid of invalidDrawings) assert.throws(() => repository.createGame(roomId, host, { kind: 'draw', word: '小猫', strokes: invalid }), { code: 'GAME_DRAWING_INVALID' });
  const tooManyPoints = new Array(25).fill({ ...strokes[0], points: new Array(500).fill({ x: 0.2, y: 0.3 }) });
  assert.throws(() => repository.createGame(roomId, host, { kind: 'draw', word: '小猫', strokes: tooManyPoints }), { code: 'GAME_DRAWING_TOO_LARGE' });
  for (const word of ['', 'a'.repeat(13), 'a\nb']) assert.throws(() => repository.createGame(roomId, host, { kind: 'draw', word, strokes }), { code: 'GAME_TEXT_INVALID' });
  assert.throws(() => repository.createGame(roomId, host, { kind: 'draw', word: '猫', strokes }), { code: 'GAME_ANSWER_INVALID' });
  const emojiWord = repository.createGame(roomId, host, { kind: 'draw', word: '🐱🐶', strokes });
  assert.equal(emojiWord.game.wordLength, 2);
  advance();
  const ascii = repository.createGame(roomId, host, { kind: 'draw', word: 'Cat', strokes });
  const result = repository.actOnGame(roomId, ascii.id, guest, { action: 'guess', guess: 'ＣＡＴ' });
  assert.equal(result.game.answer, 'Cat');
  assert.equal(result.game.status, 'completed');
});

test('game rate limits span rooms and guesses retain only the latest twenty attempts', (t) => {
  const { repository, roomId, advance } = fixture(t);
  const otherRoom = repository.createRoom({ name: '另一颗星球' }, host);
  const message = repository.createGame(roomId, host, { kind: 'draw', word: '小猫咪', strokes });
  assert.throws(() => repository.createGame(otherRoom.id, host, { kind: 'dice' }), { code: 'GAME_RATE_LIMITED' });
  advance(699);
  assert.throws(() => repository.createGame(roomId, host, { kind: 'dice' }), { code: 'GAME_RATE_LIMITED' });
  advance(1);
  repository.createGame(roomId, host, { kind: 'dice' });
  repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '猜测0' });
  advance(799);
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '太快' }), { code: 'GAME_RATE_LIMITED' });
  advance(1);
  for (let i = 1; i < 23; i += 1) {
    repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: `猜测${i}` });
    advance(800);
  }
  const result = repository.getHistory(roomId).messages.find((entry) => entry.id === message.id);
  assert.equal(result.game.guesses.length, 20);
  assert.equal(result.game.guesses[0].text, '猜测3');
  assert.equal(result.game.guesses.at(-1).text, '猜测22');
  assert.equal(result.gameRevision, 23);
});

test('simultaneous correct draw guesses and reveals close the round exactly once', async (t) => {
  const { repository, roomId, advance } = fixture(t);
  for (const contenders of [[guest, third], [guest, host]]) {
    const message = repository.createGame(roomId, host, { kind: 'draw', word: '小猫咪', strokes });
    const attempts = await Promise.allSettled(contenders.map((player) => Promise.resolve().then(() => repository.actOnGame(roomId, message.id, player, player === host ? { action: 'finish' } : { action: 'guess', guess: '小猫咪' }))));
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.find((attempt) => attempt.status === 'rejected').reason.code, 'GAME_ENDED');
    const result = repository.getHistory(roomId).messages.at(-1);
    assert.equal(result.gameRevision, 1);
    assert.equal(result.game.guesses.length, 1);
    advance();
  }
});

test('unfinished games and reply snapshots survive restart without leaking secrets or clearing old history', async (t) => {
  const { repository, roomId, dataFile, advance } = fixture(t);
  const original = repository.addMessage(roomId, host, { content: '原来的消息' });
  const reply = repository.addMessage(roomId, guest, { content: '🥰', replyToId: original.id });
  const rps = repository.createGame(roomId, host, { kind: 'rps', choice: 'scissors' });
  advance();
  const draw = repository.createGame(roomId, host, { kind: 'draw', word: '向日葵', strokes });
  repository.actOnGame(roomId, draw.id, guest, { action: 'guess', guess: '小猫咪' });
  await repository.writeQueue;
  const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(stored.version, CHAT_DATA_VERSION);
  assert.equal(stored.version, 2);
  assert.equal(stored.messages.find((message) => message.id === rps.id)._gamePrivate.hostChoice, 'scissors');
  assert.equal(stored.messages.find((message) => message.id === draw.id)._gamePrivate.answer, '向日葵');
  const reloaded = new RoomRepository({ dataFile });
  try {
    const history = reloaded.getHistory(roomId).messages;
    assert.equal(history.length, 4);
    assert.deepEqual(history.find((message) => message.id === reply.id).replyTo, reply.replyTo);
    assertNoPrivateIdentity(history);
    assert.equal(JSON.stringify(history).includes('向日葵'), false);
    assert.equal(JSON.stringify(history).includes('scissors'), false);
    const completedRps = reloaded.actOnGame(roomId, rps.id, guest, { action: 'join', choice: 'rock' });
    assert.equal(completedRps.game.hostChoice, 'scissors');
    assert.equal(completedRps.game.winner, 'guest');
    const completedDraw = reloaded.actOnGame(roomId, draw.id, third, { action: 'guess', guess: '向日葵' });
    assert.equal(completedDraw.gameRevision, 2);
    assert.equal(completedDraw.game.answer, '向日葵');
    await reloaded.writeQueue;
    const completedReload = new RoomRepository({ dataFile });
    const completedHistory = completedReload.getHistory(roomId).messages;
    assert.deepEqual(completedHistory.find((message) => message.id === rps.id).game, completedRps.game);
    assert.deepEqual(completedHistory.find((message) => message.id === draw.id).game, completedDraw.game);
    await completedReload.writeQueue;
  } finally {
    await reloaded.writeQueue;
  }
});

test('public history and game responses are detached and administrative user deletion also conceals secrets', (t) => {
  const { repository, roomId } = fixture(t);
  const message = repository.createGame('soul-harbor', host, { kind: 'draw', word: '小月亮', strokes });
  const history = repository.getHistory('soul-harbor').messages;
  history.at(-1).game.strokes[0].points.push({ x: 0.5, y: 0.5 });
  history.at(-1).game.guesses.push({ name: 'fake' });
  const clean = repository.getHistory('soul-harbor').messages.at(-1);
  assert.equal(clean.game.strokes[0].points.length, 2);
  assert.deepEqual(clean.game.guesses, []);
  const result = repository.deleteUserData({ publicKey: host.publicKey, userId: host.userId });
  assert.equal(result.deletedMessages[0].id, message.id);
  assert.equal(JSON.stringify(result.deletedMessages).includes('小月亮'), false);
  assertNoPrivateIdentity(result.deletedMessages);
  assert.throws(() => repository.actOnGame(roomId, message.id, guest, { action: 'guess', guess: '小月亮' }), { code: 'GAME_NOT_FOUND' });
});
