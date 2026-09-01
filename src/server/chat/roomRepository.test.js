const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RoomRepository } = require('./roomRepository');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-repository-'));
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  const repository = new RoomRepository({ dataFile: path.join(directory, 'soul-chat.json'), uploadDirectory });
  const owner = { id: 'guest-owner', name: '房主' };
  const visitor = { id: 'guest-visitor', name: '访客' };
  return { directory, uploadDirectory, repository, owner, visitor };
}

async function cleanupFixture(fixture) {
  await fixture.repository.writeQueue;
  await fixture.repository.cleanupQueue;
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('private password room is owner-bound, searchable and does not expose password data', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      {
        name: '秘密基地',
        description: '只通过 ID 进入',
        tags: ['私密'],
        isPrivate: true,
        passwordEnabled: true,
        password: 'A12'
      },
      fixture.owner
    );

    assert.match(room.id, /^[A-Z2-9]{4}$/);
    assert.equal(room.id, room.code);
    assert.equal(fixture.repository.listRooms(fixture.owner).some((item) => item.id === room.id), true);
    assert.equal(fixture.repository.listRooms(fixture.visitor).some((item) => item.id === room.id), true);
    assert.equal(fixture.repository.searchRoom(room.code.toLowerCase()).id, room.id);
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, ''), { code: 'ROOM_PASSWORD_REQUIRED' });
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, 'ZZ'), { code: 'ROOM_PASSWORD_INVALID' });
    assert.equal(fixture.repository.verifyRoomAccess(room.id, 'A12').id, room.id);

    const publicRoom = fixture.repository.toPublicRoom(room);
    assert.equal(publicRoom.hasPassword, true);
    assert.equal('passwordHash' in publicRoom, false);
    assert.equal('passwordSalt' in publicRoom, false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('only the creator can update or delete a room', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '可编辑房间', description: '', tags: [], isPrivate: false, passwordEnabled: false },
      fixture.owner
    );

    assert.throws(
      () => fixture.repository.updateRoom(room.id, { name: '越权', description: '', tags: [], isPrivate: false, passwordEnabled: false }, fixture.visitor),
      { code: 'ROOM_OWNER_REQUIRED' }
    );

    const updated = fixture.repository.updateRoom(
      room.id,
      { name: '新名称', description: '新描述', tags: ['新标签'], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );
    assert.equal(updated.name, '新名称');
    assert.equal(updated.isPrivate, true);

    assert.throws(() => fixture.repository.deleteRoom(room.id, fixture.visitor), { code: 'ROOM_OWNER_REQUIRED' });
    fixture.repository.deleteRoom(room.id, fixture.owner);
    assert.equal(fixture.repository.getRoom(room.id), null);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('room creator can delete any message and room deletion removes all history', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '消息管理', description: '', tags: [], isPrivate: false, passwordEnabled: false },
      fixture.owner
    );
    const visitorMessage = fixture.repository.addMessage(room.id, fixture.visitor, { type: 'text', content: '访客消息' });

    assert.throws(() => fixture.repository.deleteMessage(room.id, visitorMessage.id, fixture.visitor), { code: 'ROOM_OWNER_REQUIRED' });
    fixture.repository.deleteMessage(room.id, visitorMessage.id, fixture.owner);
    assert.equal(fixture.repository.getHistory(room.id).messages.length, 0);

    fixture.repository.addMessage(room.id, fixture.visitor, { type: 'text', content: '将随房间删除' });
    fixture.repository.deleteRoom(room.id, fixture.owner);
    assert.throws(() => fixture.repository.getHistory(room.id), { code: 'ROOM_NOT_FOUND' });
  } finally {
    await cleanupFixture(fixture);
  }
});

test('deleting an attachment message or room removes its stored upload', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '附件清理', description: '', tags: [], isPrivate: false, passwordEnabled: false },
      fixture.owner
    );
    const firstFileName = '11111111-1111-4111-8111-111111111111.txt';
    const secondFileName = '22222222-2222-4222-8222-222222222222.pdf';
    const firstPath = path.join(fixture.uploadDirectory, firstFileName);
    const secondPath = path.join(fixture.uploadDirectory, secondFileName);
    fs.writeFileSync(firstPath, 'text attachment');
    fs.writeFileSync(secondPath, 'pdf attachment');

    const firstMessage = fixture.repository.addMessage(room.id, fixture.visitor, {
      type: 'file',
      content: '',
      attachment: { url: `/uploads/soul/${firstFileName}`, name: '说明.txt', size: 15, mimeType: 'text/plain' }
    });
    fixture.repository.addMessage(room.id, fixture.visitor, {
      type: 'file',
      content: '',
      attachment: { url: `/uploads/soul/${secondFileName}`, name: '资料.pdf', size: 14, mimeType: 'application/pdf' }
    });

    fixture.repository.deleteMessage(room.id, firstMessage.id, fixture.owner);
    await fixture.repository.cleanupQueue;
    assert.equal(fs.existsSync(firstPath), false);
    assert.equal(fs.existsSync(secondPath), true);

    fixture.repository.deleteRoom(room.id, fixture.owner);
    await fixture.repository.cleanupQueue;
    assert.equal(fs.existsSync(secondPath), false);
  } finally {
    await cleanupFixture(fixture);
  }
});
