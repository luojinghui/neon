const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CHAT_DATA_VERSION, RoomRepository } = require('./roomRepository');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-repository-'));
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  const repository = new RoomRepository({ dataFile: path.join(directory, 'soul-chat.json'), uploadDirectory });
  const owner = { id: 'guest-owner', userId: 'Owner01', publicKey: 'owner-public-key', name: '房主', avatarUrl: '' };
  const visitor = { id: 'guest-visitor', userId: 'Visitor01', publicKey: 'visitor-public-key', name: '访客', avatarUrl: '' };
  return { directory, uploadDirectory, repository, owner, visitor };
}

async function cleanupFixture(fixture) {
  await fixture.repository.writeQueue;
  await fixture.repository.cleanupQueue;
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('ships two relaxed default rooms and clears all pre-profile chat history once', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-defaults-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  const legacyFileName = '33333333-3333-4333-8333-333333333333.txt';
  fs.writeFileSync(path.join(uploadDirectory, legacyFileName), 'legacy attachment');
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      rooms: [
        {
          id: 'soul-harbor',
          code: 'LH01',
          name: '灵魂港湾',
          description: '旧描述',
          tags: ['旧标签'],
          ownerId: 'planet-system',
          isPrivate: false,
          isFixed: true,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'inspiration-orbit',
          code: 'LG01',
          name: '灵感轨道',
          description: '旧默认星球',
          tags: ['灵感'],
          ownerId: 'planet-system',
          isPrivate: false,
          isFixed: true,
          createdAt: '2026-01-01T00:02:00.000Z'
        },
        {
          id: 'OLD1',
          code: 'OLD1',
          name: '旧星球',
          description: '应被清理',
          tags: [],
          ownerId: 'legacy-owner',
          isPrivate: false,
          isFixed: false,
          createdAt: '2025-01-01T00:00:00.000Z'
        }
      ],
      messages: [
        {
          id: 'legacy-message',
          roomId: 'OLD1',
          senderId: 'legacy-user',
          senderName: '旧用户',
          type: 'file',
          content: '旧文件',
          timestamp: Date.now(),
          attachment: { url: `/uploads/soul/${legacyFileName}`, name: '旧文件.txt', size: 17, mimeType: 'text/plain' }
        }
      ]
    })
  );
  const repository = new RoomRepository({ dataFile, uploadDirectory });

  try {
    const fixedRooms = repository.listRooms().filter((room) => room.isFixed);
    assert.deepEqual(
      fixedRooms.map((room) => room.name),
      ['随便聊聊', '灵感晾晒场']
    );
    assert.equal(repository.getRoom('inspiration-orbit'), null);
    assert.equal(repository.getRoom('OLD1'), null);
    assert.deepEqual(repository.getRoom('soul-harbor').tags, ['日常', '闲聊']);
    await repository.cleanupQueue;
    assert.equal(fs.existsSync(path.join(uploadDirectory, legacyFileName)), false);
    await repository.writeQueue;
    assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).version, CHAT_DATA_VERSION);
  } finally {
    await repository.writeQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('removes rooms and messages without a current profile and refreshes known sender data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-profile-cleanup-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  const ownerUuid = 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552';
  const profile = { uuid: ownerUuid, publicKey: 'known-public-key', userId: 'CurrentUser', name: '当前用户', avatarUrl: '' };
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      version: CHAT_DATA_VERSION,
      rooms: [
        {
          id: 'KEEP',
          code: 'KEEP',
          name: '保留星球',
          description: '',
          tags: [],
          ownerId: `guest-${ownerUuid}`,
          isPrivate: false,
          isFixed: false,
          createdAt: '2026-01-02T00:00:00.000Z'
        },
        {
          id: 'DROP',
          code: 'DROP',
          name: '无主星球',
          description: '',
          tags: [],
          ownerId: 'legacy-owner',
          isPrivate: false,
          isFixed: false,
          createdAt: '2026-01-02T00:00:00.000Z'
        }
      ],
      messages: [
        {
          id: 'known-message',
          roomId: 'KEEP',
          senderId: 'OldUserId',
          senderKey: profile.publicKey,
          senderName: '旧名称',
          type: 'text',
          content: '保留消息',
          timestamp: Date.parse('2026-01-02T00:01:00.000Z')
        },
        {
          id: 'unknown-message',
          roomId: 'KEEP',
          senderId: 'MissingUser',
          senderKey: 'missing-public-key',
          senderName: '不存在的人',
          type: 'text',
          content: '应被清理',
          timestamp: Date.parse('2026-01-02T00:02:00.000Z')
        }
      ]
    })
  );

  const repository = new RoomRepository({
    dataFile,
    uploadDirectory,
    resolveProfile({ uuid, publicKey }) {
      return uuid === profile.uuid || publicKey === profile.publicKey ? profile : null;
    }
  });

  try {
    assert.ok(repository.getRoom('KEEP'));
    assert.equal(repository.getRoom('DROP'), null);
    const history = repository.getHistory('KEEP').messages;
    assert.deepEqual(history.map((message) => message.id), ['known-message']);
    assert.equal(history[0].senderId, profile.userId);
    assert.equal(history[0].senderName, profile.name);
  } finally {
    await cleanupFixture({ directory, uploadDirectory, repository });
  }
});

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

test('super admin can bypass room passwords and manage any non-owned room', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '管理员检查房间', description: '私密内容', tags: ['私密'], isPrivate: true, passwordEnabled: true, password: 'A12' },
      fixture.owner
    );
    const message = fixture.repository.addMessage(room.id, fixture.owner, { type: 'text', content: '待检查消息' });

    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { bypassPassword: true }).id, room.id);
    const updated = fixture.repository.updateRoomAsAdmin(room.id, {
      name: '已检查房间',
      description: '管理员已更新',
      tags: ['审计'],
      isPrivate: true,
      passwordEnabled: true,
      password: ''
    });
    assert.equal(updated.name, '已检查房间');
    assert.equal(fixture.repository.getAdminRooms().find((item) => item.id === room.id).messageCount, 1);
    assert.equal(fixture.repository.deleteMessage(room.id, message.id, fixture.visitor, { isAdmin: true }).id, message.id);
    assert.equal(fixture.repository.deleteRoomAsAdmin(room.id).id, room.id);
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

test('changing public userId keeps room ownership bound to the stable browser identity', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '身份测试', description: '', tags: [], isPrivate: false, passwordEnabled: false },
      fixture.owner
    );
    const renamedOwner = { ...fixture.owner, userId: 'RenamedOwner' };
    const updated = fixture.repository.updateRoom(
      room.id,
      { name: '仍然属于我', description: '', tags: [], isPrivate: false, passwordEnabled: false },
      renamedOwner
    );
    assert.equal(updated.name, '仍然属于我');
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
    assert.equal(visitorMessage.senderId, fixture.visitor.userId);
    assert.equal(visitorMessage.senderKey, fixture.visitor.publicKey);

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
