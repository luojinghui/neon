const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CHAT_DATA_VERSION, ROOM_ACCESS_MAX_ATTEMPTS, RoomRepository } = require('./roomRepository');

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

test('private room is listed only for authorized users but remains discoverable by exact ID', async () => {
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
    assert.equal(fixture.repository.listRooms(fixture.visitor).some((item) => item.id === room.id), false);
    assert.equal(fixture.repository.listRooms(fixture.visitor, { isAdmin: true }).some((item) => item.id === room.id), true);
    assert.equal(fixture.repository.searchRoom(room.code.toLowerCase()).id, room.id);
    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.owner }).id, room.id);
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor }), { code: 'ROOM_ACCESS_REQUIRED' });
    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor, isAdmin: true }).id, room.id);

    const publicRoom = fixture.repository.toPublicRoom(room);
    assert.equal(publicRoom.hasPassword, false);
    assert.equal('passwordHash' in publicRoom, false);
    assert.equal('passwordSalt' in publicRoom, false);
    assert.equal('inviteToken' in publicRoom, false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('access applications are deduplicated, room-scoped, approvable and reset after revocation', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '审批测试', description: '', tags: [], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );
    const otherRoom = fixture.repository.createRoom(
      { name: '另一个星球', description: '', tags: [], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );

    const first = fixture.repository.requestRoomAccess(room.id, fixture.visitor);
    assert.equal(first.status, 'pending');
    assert.equal(first.attemptCount, 1);
    assert.throws(() => fixture.repository.requestRoomAccess(room.id, fixture.visitor), { code: 'ROOM_ACCESS_PENDING' });
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor }), { code: 'ROOM_ACCESS_PENDING' });

    fixture.repository.decideRoomAccess(room.id, fixture.visitor.id, 'rejected', fixture.owner);
    assert.deepEqual(fixture.repository.getRoomAccessState(room.id, fixture.visitor), { status: 'rejected', attemptCount: 1, remainingAttempts: 4 });
    const second = fixture.repository.requestRoomAccess(room.id, fixture.visitor);
    assert.equal(second.attemptCount, 2);
    fixture.repository.decideRoomAccess(room.id, fixture.visitor.id, 'approved', fixture.owner);

    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor }).id, room.id);
    assert.equal(fixture.repository.listRooms(fixture.visitor).some((item) => item.id === room.id), true);
    assert.throws(() => fixture.repository.verifyRoomAccess(otherRoom.id, '', { user: fixture.visitor }), { code: 'ROOM_ACCESS_REQUIRED' });
    assert.equal(fixture.repository.getRoomAccessManagement(room.id, fixture.owner).members.length, 1);

    fixture.repository.revokeRoomAccess(room.id, fixture.visitor.id, fixture.owner);
    assert.equal(fixture.repository.listRooms(fixture.visitor).some((item) => item.id === room.id), false);
    assert.deepEqual(fixture.repository.getRoomAccessState(room.id, fixture.visitor), { status: 'none', attemptCount: 0, remainingAttempts: 5 });
    assert.equal(fixture.repository.requestRoomAccess(room.id, fixture.visitor).attemptCount, 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('rejected applicants can submit at most five times', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '申请上限', description: '', tags: [], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );
    for (let attempt = 1; attempt <= ROOM_ACCESS_MAX_ATTEMPTS; attempt += 1) {
      assert.equal(fixture.repository.requestRoomAccess(room.id, fixture.visitor).attemptCount, attempt);
      fixture.repository.decideRoomAccess(room.id, fixture.visitor.id, 'rejected', fixture.owner);
    }
    assert.deepEqual(fixture.repository.getRoomAccessState(room.id, fixture.visitor), { status: 'exhausted', attemptCount: 5, remainingAttempts: 0 });
    assert.throws(() => fixture.repository.requestRoomAccess(room.id, fixture.visitor), { code: 'ROOM_ACCESS_EXHAUSTED' });
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor }), { code: 'ROOM_ACCESS_EXHAUSTED' });
  } finally {
    await cleanupFixture(fixture);
  }
});

test('rotating a private invite invalidates the old link and the new link grants room access', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '邀请链接', description: '', tags: [], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );
    const oldToken = room.inviteToken;
    const newToken = fixture.repository.rotateInviteToken(room.id, fixture.owner);
    assert.notEqual(newToken, oldToken);
    assert.throws(() => fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor, inviteToken: oldToken }), { code: 'ROOM_ACCESS_REQUIRED' });
    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { user: fixture.visitor, inviteToken: newToken }).id, room.id);
    const management = fixture.repository.getRoomAccessManagement(room.id, fixture.owner);
    assert.equal(management.members.length, 1);
    assert.equal(management.members[0].source, 'invite');
    assert.equal(management.inviteToken, newToken);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('approved room access survives repository reloads', async () => {
  const fixture = createFixture();
  let reloaded;
  try {
    const room = fixture.repository.createRoom(
      { name: '持久化授权', description: '', tags: [], isPrivate: true, passwordEnabled: false },
      fixture.owner
    );
    fixture.repository.requestRoomAccess(room.id, fixture.visitor);
    fixture.repository.decideRoomAccess(room.id, fixture.visitor.id, 'approved', fixture.owner);
    await fixture.repository.writeQueue;

    reloaded = new RoomRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.uploadDirectory });
    assert.equal(reloaded.verifyRoomAccess(room.id, '', { user: fixture.visitor }).id, room.id);
    assert.equal(reloaded.getRoomAccessManagement(room.id, fixture.owner).members[0].requesterId, fixture.visitor.id);
  } finally {
    if (reloaded) await reloaded.writeQueue;
    await cleanupFixture(fixture);
  }
});

test('removes passwords from persisted private rooms during migration', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-room-private-migration-'));
  const dataFile = path.join(directory, 'soul-chat.json');
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(uploadDirectory);
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      version: CHAT_DATA_VERSION,
      rooms: [
        {
          id: 'LOCK',
          code: 'LOCK',
          name: '旧私密星球',
          description: '',
          tags: [],
          ownerId: 'guest-owner',
          isPrivate: true,
          isFixed: false,
          passwordHash: 'legacy-hash',
          passwordSalt: 'legacy-salt',
          createdAt: '2026-01-02T00:00:00.000Z'
        }
      ],
      messages: []
    })
  );
  const repository = new RoomRepository({ dataFile, uploadDirectory });

  try {
    const room = repository.getRoom('LOCK');
    assert.equal('passwordHash' in room, false);
    assert.equal('passwordSalt' in room, false);
    assert.match(room.inviteToken, /^[A-Za-z0-9_-]{32}$/);
    await repository.writeQueue;
    const storedRoom = JSON.parse(fs.readFileSync(dataFile, 'utf8')).rooms.find((item) => item.id === 'LOCK');
    assert.equal('passwordHash' in storedRoom, false);
    assert.equal('passwordSalt' in storedRoom, false);
  } finally {
    await cleanupFixture({ directory, uploadDirectory, repository });
  }
});

test('super admin can inspect private rooms, bypass public passwords and manage non-owned rooms', async () => {
  const fixture = createFixture();
  try {
    const room = fixture.repository.createRoom(
      { name: '管理员检查房间', description: '私密内容', tags: ['私密'], isPrivate: true, passwordEnabled: true, password: 'A12' },
      fixture.owner
    );
    const message = fixture.repository.addMessage(room.id, fixture.owner, { type: 'text', content: '待检查消息' });

    const passwordRoom = fixture.repository.createRoom(
      { name: '有密码的公开房间', description: '', tags: [], isPrivate: false, passwordEnabled: true, password: 'A12' },
      fixture.owner
    );

    assert.equal(fixture.repository.verifyRoomAccess(room.id, '', { isAdmin: true }).id, room.id);
    assert.throws(() => fixture.repository.verifyRoomAccess(passwordRoom.id, ''), { code: 'ROOM_PASSWORD_REQUIRED' });
    assert.equal(fixture.repository.verifyRoomAccess(passwordRoom.id, '', { isAdmin: true }).id, passwordRoom.id);
    const updated = fixture.repository.updateRoomAsAdmin(room.id, {
      name: '已检查房间',
      description: '管理员已更新',
      tags: ['审计'],
      isPrivate: true,
      passwordEnabled: true,
      password: ''
    });
    assert.equal(updated.name, '已检查房间');
    assert.equal(fixture.repository.toPublicRoom(updated).hasPassword, false);
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
