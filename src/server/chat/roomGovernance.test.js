const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RoomRepository } = require('./roomRepository');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-governance-'));
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  const repository = new RoomRepository({ dataFile: path.join(directory, 'soul-chat.json'), uploadDirectory });
  const owner = { id: 'guest-owner', userId: 'Owner01', publicKey: 'owner-public-key', name: '房主', avatarUrl: '' };
  const visitor = { id: 'guest-visitor', userId: 'Visitor01', publicKey: 'visitor-public-key', name: '访客', avatarUrl: '' };
  const room = repository.createRoom({ name: '治理测试', description: '', isPrivate: false, passwordEnabled: false }, owner);
  return { directory, repository, owner, visitor, room };
}

async function cleanup(f) {
  await f.repository.writeQueue;
  fs.rmSync(f.directory, { recursive: true, force: true });
}

test('announcement and rules are owner-only, limited and clearable', async () => {
  const f = createFixture();
  const updated = f.repository.updateAnnouncement(f.room.id, '  欢迎  ', f.owner);
  assert.equal(updated.announcement.text, '欢迎');
  assert.equal(f.repository.toPublicRoom(updated).announcement.text, '欢迎');
  assert.throws(() => f.repository.updateAnnouncement(f.room.id, 'x', f.visitor), { code: 'ROOM_OWNER_REQUIRED' });
  assert.throws(() => f.repository.updateAnnouncement(f.room.id, 'x'.repeat(501), f.owner), { code: 'ROOM_GOVERNANCE_TOO_LONG' });
  assert.throws(() => f.repository.updateRules(f.room.id, 'x'.repeat(2001), f.owner), { code: 'ROOM_GOVERNANCE_TOO_LONG' });
  f.repository.updateRules(f.room.id, '禁止灌水', f.owner);
  assert.equal(f.repository.updateAnnouncement(f.room.id, '', f.owner).announcement, undefined);
  assert.equal(f.repository.getRoom(f.room.id).rules.text, '禁止灌水');
  const admin = f.repository.updateAnnouncement('soul-harbor', '官方公告', null, { isAdmin: true });
  assert.equal(admin.announcement.text, '官方公告');
  await cleanup(f);
});

test('legacy rooms expose empty governance data', async () => {
  const f = createFixture();
  const publicRoom = f.repository.toPublicRoom(f.room);
  assert.equal(publicRoom.announcement, null);
  assert.equal(publicRoom.rules, null);
  assert.deepEqual(publicRoom.pinnedMessages, []);
  await cleanup(f);
});

test('pins are limited to three, ordered newest first and cleaned on message removal', async () => {
  const f = createFixture();
  const messages = [1, 2, 3, 4].map((n) => f.repository.addMessage(f.room.id, f.owner, { type: 'text', content: `m${n}` }));
  for (const message of messages.slice(0, 3)) f.repository.pinMessage(f.room.id, message.id, f.owner);
  assert.deepEqual(f.repository.getPinnedMessages(f.repository.getRoom(f.room.id)).map((m) => m.content), ['m3', 'm2', 'm1']);
  assert.throws(() => f.repository.pinMessage(f.room.id, messages[3].id, f.owner), { code: 'ROOM_PIN_LIMIT' });
  assert.throws(() => f.repository.pinMessage(f.room.id, messages[0].id, f.visitor), { code: 'ROOM_OWNER_REQUIRED' });
  assert.throws(() => f.repository.pinMessage(f.room.id, 'missing', f.owner), { code: 'MESSAGE_NOT_FOUND' });
  f.repository.recallMessage(f.room.id, messages[1].id, f.owner);
  assert.deepEqual(f.repository.getRoom(f.room.id).pinnedMessageIds, [messages[2].id, messages[0].id]);
  f.repository.unpinMessage(f.room.id, messages[2].id, f.owner);
  assert.deepEqual(f.repository.getRoom(f.room.id).pinnedMessageIds, [messages[0].id]);
  await cleanup(f);
});

test('kicking from a public room bans re-entry for a short period', async () => {
  const f = createFixture();
  const result = f.repository.kickMember(f.room.id, f.visitor.id, f.owner);
  assert.equal(result.mode, 'banned');
  assert.throws(() => f.repository.verifyRoomAccess(f.room.id, '', { user: f.visitor }), { code: 'ROOM_BANNED' });
  f.repository.verifyRoomAccess(f.room.id, '', { user: f.owner });
  f.repository.rooms.set(f.room.id, { ...f.repository.getRoom(f.room.id), bans: { [f.visitor.id]: Date.now() - 1 } });
  assert.equal(f.repository.verifyRoomAccess(f.room.id, '', { user: f.visitor }).id, f.room.id);
  await cleanup(f);
});

test('kick rejects owner, self and non-managers', async () => {
  const f = createFixture();
  assert.throws(() => f.repository.kickMember(f.room.id, f.owner.id, f.owner), { code: 'ROOM_KICK_FORBIDDEN' });
  assert.throws(() => f.repository.kickMember(f.room.id, f.owner.id, null, { isAdmin: true }), { code: 'ROOM_KICK_FORBIDDEN' });
  assert.throws(() => f.repository.kickMember(f.room.id, 'guest-other', f.visitor), { code: 'ROOM_OWNER_REQUIRED' });
  await cleanup(f);
});

test('kicking from a private room revokes approved access', async () => {
  const f = createFixture();
  const room = f.repository.createRoom({ name: '私密', description: '', isPrivate: true, passwordEnabled: false }, f.owner);
  f.repository.requestRoomAccess(room.id, f.visitor);
  f.repository.decideRoomAccess(room.id, f.visitor.id, 'approved', f.owner);
  assert.equal(f.repository.getApprovedMemberRecords(room.id).length, 1);
  const result = f.repository.kickMember(room.id, f.visitor.id, f.owner);
  assert.equal(result.mode, 'revoked');
  assert.equal(f.repository.canViewRoom(room, f.visitor), false);
  assert.equal(f.repository.getApprovedMemberRecords(room.id).length, 0);
  await cleanup(f);
});
