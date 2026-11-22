const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { IslandRepository, INVITE_TTL_MS, PASSCODE_ALPHABET } = require('./islandRepository');

function createFixture(t, initialNow = Date.parse('2026-06-01T00:00:00.000Z')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-island-repo-'));
  const dataFile = path.join(dir, 'islands.json');
  const uploadDirectory = path.join(dir, 'uploads', 'islands');
  let nowMs = initialNow;
  const profiles = new Map([
    [
      'owner-pub',
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        publicKey: 'owner-pub',
        userId: 'Owner01',
        name: '岛主小橘',
        avatarUrl: ''
      }
    ],
    [
      'guest-a-pub',
      {
        uuid: '22222222-2222-4222-8222-222222222222',
        publicKey: 'guest-a-pub',
        userId: 'GuestA',
        name: '访客阿星',
        avatarUrl: ''
      }
    ],
    [
      'guest-b-pub',
      {
        uuid: '33333333-3333-4333-8333-333333333333',
        publicKey: 'guest-b-pub',
        userId: 'GuestB',
        name: '访客小云',
        avatarUrl: ''
      }
    ]
  ]);

  const resolveProfile = ({ uuid, publicKey, userId }) => {
    for (const p of profiles.values()) {
      if (uuid && p.uuid === uuid) return p;
      if (publicKey && p.publicKey === publicKey) return p;
      if (userId && p.userId.toLowerCase() === String(userId).toLowerCase()) return p;
    }
    return null;
  };

  const repo = new IslandRepository({
    dataFile,
    uploadDirectory,
    now: () => nowMs,
    resolveProfile
  });

  t.after(async () => {
    await repo.writeQueue;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return {
    dir,
    dataFile,
    uploadDirectory,
    repo,
    owner: profiles.get('owner-pub'),
    guestA: profiles.get('guest-a-pub'),
    guestB: profiles.get('guest-b-pub'),
    advanceMs(ms) {
      nowMs += ms;
    },
    reloadRepo() {
      return new IslandRepository({
        dataFile,
        uploadDirectory,
        now: () => nowMs,
        resolveProfile
      });
    }
  };
}

test('ensurePersonalIsland creates one private island per user with 30d invite link', async (t) => {
  const { repo, owner, reloadRepo } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  const again = await repo.ensurePersonalIsland(owner);

  assert.equal(island.id, again.id);
  assert.equal(island.ownerPublicKey, owner.publicKey);
  assert.ok(island.inviteToken.length >= 12);
  assert.equal(
    Date.parse(island.inviteExpiresAt) - Date.parse(island.createdAt),
    INVITE_TTL_MS
  );

  // Persisted across reload
  const reloaded = reloadRepo();
  const loaded = reloaded.getIslandById(island.id);
  assert.equal(loaded.id, island.id);
  assert.equal(loaded.inviteToken, island.inviteToken);
});

test('invite link preview, direct multi-member join, and persistent access', async (t) => {
  const { repo, owner, guestA, guestB } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);

  // Preview before joining does not leak islandId
  const previewBefore = repo.previewInvite(island.inviteToken, guestA);
  assert.equal(previewBefore.islandName, island.name);
  assert.equal(previewBefore.alreadyJoined, false);
  assert.equal(previewBefore.isOwner, false);
  assert.equal(previewBefore.expired, false);
  assert.equal(previewBefore.islandId, undefined);

  // Direct invite link join succeeds
  const joinedA = await repo.joinByInvite(island.inviteToken, guestA);
  assert.equal(joinedA.id, island.id);
  assert.ok(joinedA.members[guestA.publicKey]);

  // Same invite link lets another member join
  const joinedB = await repo.joinByInvite(island.inviteToken, guestB);
  assert.ok(joinedB.members[guestB.publicKey]);

  // Preview after joining reveals alreadyJoined + islandId
  const previewAfter = repo.previewInvite(island.inviteToken, guestA);
  assert.equal(previewAfter.alreadyJoined, true);
  assert.equal(previewAfter.islandId, island.id);

  // Revisit via listJoinedIslands & canAccessIsland
  const joinedList = repo.listJoinedIslands(guestA.publicKey);
  assert.equal(joinedList.length, 1);
  assert.equal(joinedList[0].id, island.id);
  assert.equal(repo.canAccessIsland(joinedB, guestA), true);

  // Non-owner summary hides inviteToken
  const visitorSummary = repo.presentSummary(joinedB, guestA);
  assert.equal(visitorSummary.inviteToken, undefined);

  // Owner summary includes inviteToken
  const ownerSummary = repo.presentSummary(joinedB, owner);
  assert.equal(ownerSummary.inviteToken, island.inviteToken);
});

test('regenerating invite rotates inviteToken and refreshes 30d expiry while keeping existing members', async (t) => {
  const { repo, owner, guestA, guestB, advanceMs } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  await repo.joinByInvite(island.inviteToken, guestA);

  // Advance 20 days and refresh invite link
  advanceMs(20 * 24 * 60 * 60 * 1000);
  const regen = await repo.updateSettings(island.id, owner, { regenerateInvite: true });
  assert.notEqual(regen.inviteToken, island.inviteToken);
  assert.ok(Date.parse(regen.inviteExpiresAt) > Date.parse(island.inviteExpiresAt));

  // Old invite token is now invalid
  assert.throws(
    () => repo.previewInvite(island.inviteToken, guestB),
    (err) => err.code === 'ISLAND_INVITE_INVALID'
  );

  // Existing member guestA STILL has access
  assert.equal(repo.canAccessIsland(regen, guestA), true);
  assert.equal(repo.listJoinedIslands(guestA.publicKey).length, 1);

  // Explicit removal revokes member access
  const removed = await repo.updateSettings(island.id, owner, { removeMemberPublicKey: guestA.publicKey });
  assert.equal(repo.canAccessIsland(removed, guestA), false);

  // Expired invite rejects new member
  advanceMs(31 * 24 * 60 * 60 * 1000);
  const expiredPreview = repo.previewInvite(regen.inviteToken, guestB);
  assert.equal(expiredPreview.expired, true);
  await assert.rejects(
    () => repo.joinByInvite(regen.inviteToken, guestB),
    (err) => err.code === 'ISLAND_INVITE_EXPIRED'
  );
});

test('items CRUD and permission boundaries for owner, member, and admin', async (t) => {
  const { repo, owner, guestA, guestB } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  await repo.joinByInvite(island.inviteToken, guestA);

  // Owner creates a note and a sticker
  const ownerNote = await repo.upsertItem(island.id, owner, {
    type: 'note',
    x: 100,
    y: 200,
    w: 220,
    h: 180,
    rotation: -3,
    zIndex: 1,
    data: { text: '欢迎来到浮岛', color: 'sun' }
  });
  assert.equal(ownerNote.authorPublicKey, owner.publicKey);
  assert.equal(ownerNote.data.color, 'sun');

  // GuestA creates a polaroid and a tape
  const guestPolaroid = await repo.upsertItem(island.id, guestA, {
    type: 'polaroid',
    x: 320,
    y: 120,
    w: 240,
    h: 280,
    rotation: 4,
    zIndex: 2,
    data: { imageUrl: '/uploads/islands/demo.png', caption: '海边日落', dateLabel: '2026.06' }
  });
  assert.equal(guestPolaroid.authorPublicKey, guestA.publicKey);

  const guestTape = await repo.upsertItem(island.id, guestA, {
    type: 'tape',
    x: 350,
    y: 110,
    w: 120,
    h: 32,
    rotation: -8,
    zIndex: 3,
    data: { presetId: 'washi-coral' }
  });
  assert.equal(guestTape.type, 'tape');

  // GuestA can move/edit/delete own item
  const moved = await repo.moveItem(island.id, guestA, { itemId: guestPolaroid.id, x: 400, y: 150 });
  assert.equal(moved.x, 400);
  assert.equal(moved.y, 150);

  // GuestA CAN arrange (move, resize, rotate, zIndex) owner's item,
  // but CANNOT edit its content or delete it
  const arrangedOwnerNote = await repo.moveItem(island.id, guestA, {
    itemId: ownerNote.id,
    x: 180,
    y: 260,
    w: 280,
    h: 220,
    rotation: 6,
    zIndex: 9
  });
  assert.equal(arrangedOwnerNote.x, 180);
  assert.equal(arrangedOwnerNote.y, 260);
  assert.equal(arrangedOwnerNote.w, 280);
  assert.equal(arrangedOwnerNote.h, 220);
  assert.equal(arrangedOwnerNote.rotation, 6);
  assert.equal(arrangedOwnerNote.zIndex, 9);

  await assert.rejects(
    () => repo.upsertItem(island.id, guestA, { ...ownerNote, data: { text: 'hacked', color: 'sky' } }),
    (err) => err.code === 'ISLAND_ITEM_FORBIDDEN'
  );
  await assert.rejects(
    () => repo.deleteItem(island.id, guestA, ownerNote.id),
    (err) => err.code === 'ISLAND_ITEM_FORBIDDEN'
  );

  // Updating an author's profile name is reflected in presented item authorName
  owner.name = '新岛主昵称';
  const detailAfterRename = repo.presentDetail(repo.getIslandById(island.id), owner);
  const renamedNote = detailAfterRename.items.find((it) => it.id === ownerNote.id);
  assert.equal(renamedNote?.authorName, '新岛主昵称');

  // Unjoined guestB cannot arrange owner's item
  await assert.rejects(
    () => repo.moveItem(island.id, guestB, { itemId: ownerNote.id, x: 999, y: 999 }),
    (err) => err.code === 'ISLAND_ITEM_FORBIDDEN'
  );

  // Unjoined guestB cannot create items
  await assert.rejects(
    () => repo.upsertItem(island.id, guestB, { type: 'sticker', x: 0, y: 0, w: 80, h: 80, rotation: 0, zIndex: 1, data: { presetId: 'star' } }),
    (err) => err.code === 'ISLAND_FORBIDDEN'
  );

  // Owner CAN delete member's item
  const deletedByOwner = await repo.deleteItem(island.id, owner, guestTape.id);
  assert.equal(deletedByOwner.id, guestTape.id);

  // Admin CAN delete any item and remove member
  const deletedByAdmin = await repo.deleteItem(island.id, null, ownerNote.id, { isAdmin: true });
  assert.equal(deletedByAdmin.id, ownerNote.id);

  const { removedMember } = await repo.removeMemberAsAdmin(island.id, guestA.publicKey);
  assert.equal(removedMember.publicKey, guestA.publicKey);
});

test('saveMedia validates image type and 8MB limit and stores under uploadDirectory', async (t) => {
  const { repo, owner, uploadDirectory } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);

  const saved = await repo.saveMedia(island.id, owner, {
    buffer: Buffer.from('fake-png-bytes'),
    mimeType: 'image/png',
    name: 'photo.png'
  });
  assert.ok(saved.url.startsWith('/uploads/islands/'));
  const fileName = saved.url.replace('/uploads/islands/', '');
  assert.ok(fs.existsSync(path.join(uploadDirectory, fileName)));

  await assert.rejects(
    () => repo.saveMedia(island.id, owner, { buffer: Buffer.from('x'), mimeType: 'application/pdf', name: 'doc.pdf' }),
    (err) => err.code === 'ISLAND_MEDIA_INVALID'
  );

  await assert.rejects(
    () => repo.saveMedia(island.id, owner, { buffer: Buffer.alloc(8 * 1024 * 1024 + 1), mimeType: 'image/jpeg', name: 'huge.jpg' }),
    (err) => err.code === 'ISLAND_MEDIA_TOO_LARGE'
  );
});

test('leaveIsland allows visitor to leave and prevents owner from leaving own island', async (t) => {
  const { repo, owner, guestA } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  await repo.joinByInvite(island.inviteToken, guestA);

  await assert.rejects(
    () => repo.leaveIsland(island.id, owner),
    (err) => err.code === 'ISLAND_OWNER_CANNOT_LEAVE'
  );

  const res = await repo.leaveIsland(island.id, guestA);
  assert.equal(res.ok, true);
  assert.equal(res.removed, true);
  assert.equal(repo.listJoinedIslands(guestA.publicKey).length, 0);
});

test('skin and paper appearance settings default, validate, and persist across reload', async (t) => {
  const { repo, owner, guestA, reloadRepo } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  assert.equal(island.skin, 'inherit');
  assert.equal(island.paper, 'dot');

  const updated = await repo.updateSettings(island.id, owner, { skin: 'violet', paper: 'grid' });
  assert.equal(updated.skin, 'violet');
  assert.equal(updated.paper, 'grid');

  await assert.rejects(
    () => repo.updateSettings(island.id, owner, { skin: 'neon-invalid' }),
    (err) => err.code === 'ISLAND_SKIN_INVALID'
  );
  await assert.rejects(
    () => repo.updateSettings(island.id, owner, { paper: 'marble' }),
    (err) => err.code === 'ISLAND_PAPER_INVALID'
  );
  await assert.rejects(
    () => repo.updateSettings(island.id, guestA, { skin: 'blue' }),
    (err) => err.code === 'ISLAND_FORBIDDEN'
  );

  const reloaded = reloadRepo().getIslandById(island.id);
  assert.equal(reloaded.skin, 'violet');
  assert.equal(reloaded.paper, 'grid');
});

test('countdown and checklist items support guest toggle without allowing guest edits', async (t) => {
  const { repo, owner, guestA } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  await repo.joinByInvite(island.inviteToken, guestA);

  const countdown = await repo.upsertItem(island.id, owner, {
    type: 'countdown',
    x: 0,
    y: 0,
    w: 220,
    h: 176,
    data: { title: '去看海', targetDate: '2026-08-15', color: 'sky' }
  });
  assert.equal(countdown.type, 'countdown');
  assert.equal(countdown.data.targetDate, '2026-08-15');

  const checklist = await repo.upsertItem(island.id, owner, {
    type: 'checklist',
    x: 240,
    y: 0,
    w: 248,
    h: 268,
    data: {
      title: '露营清单',
      color: 'mint',
      entries: [
        { id: 'item1', text: '带帐篷', done: false },
        { id: 'item2', text: '带咖啡', done: false }
      ]
    }
  });
  assert.equal(checklist.data.entries.length, 2);

  // Guest can toggle done on owner's checklist
  const toggled = await repo.toggleChecklistEntry(island.id, guestA, {
    itemId: checklist.id,
    entryId: 'item1',
    done: true
  });
  assert.equal(toggled.data.entries[0].done, true);
  assert.equal(toggled.data.entries[1].done, false);

  // Guest still cannot rename/add/delete entries on owner's checklist
  await assert.rejects(
    () =>
      repo.upsertItem(island.id, guestA, {
        id: checklist.id,
        type: 'checklist',
        x: 240,
        y: 0,
        w: 248,
        h: 268,
        data: { title: '篡改标题', color: 'mint', entries: [] }
      }),
    (err) => err.code === 'ISLAND_ITEM_FORBIDDEN'
  );
});

test('doodle strokes validate, compute bbox, allow all island members to edit/delete, and persist', async (t) => {
  const { repo, owner, guestA, guestB, reloadRepo } = createFixture(t);
  const island = await repo.ensurePersonalIsland(owner);
  await repo.joinByInvite(island.inviteToken, guestA);

  const ownerStroke = await repo.addStroke(island.id, owner, {
    tool: 'pen',
    color: '#E05A47',
    size: 6,
    opacity: 1,
    points: [10, 20, 40, 50, 80, 15]
  });
  assert.deepEqual(ownerStroke.bbox, { minX: 10, minY: 15, maxX: 80, maxY: 50 });

  const guestStroke = await repo.addStroke(island.id, guestA, {
    tool: 'highlighter',
    color: '#2B7DE9',
    size: 18,
    opacity: 0.35,
    points: [-10, -20, 30, 40]
  });

  // Non-member cannot erase strokes
  await assert.rejects(
    () => repo.deleteStroke(island.id, guestB, ownerStroke.id),
    (err) => err.code === 'ISLAND_STROKE_FORBIDDEN'
  );

  // Reload preserves both strokes
  const reloaded = reloadRepo().getIslandById(island.id);
  assert.equal(reloaded.strokes.length, 2);

  // Member can move/scale strokes via transformStrokes
  const transformed = await repo.transformStrokes(island.id, guestA, [
    { strokeId: ownerStroke.id, points: [20, 30, 80, 90], size: 9 }
  ]);
  assert.equal(transformed.length, 1);
  assert.equal(transformed[0].size, 9);
  assert.deepEqual(transformed[0].bbox, { minX: 20, minY: 30, maxX: 80, maxY: 90 });

  // Member can delete owner's stroke, and owner can delete member's stroke
  const deletedOwnerByGuest = await repo.deleteStroke(island.id, guestA, ownerStroke.id);
  assert.equal(deletedOwnerByGuest.id, ownerStroke.id);
  const deletedGuestByOwner = await repo.deleteStroke(island.id, owner, guestStroke.id);
  assert.equal(deletedGuestByOwner.id, guestStroke.id);
  assert.equal(repo.getIslandById(island.id).strokes.length, 0);
});
