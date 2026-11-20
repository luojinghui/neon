const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { MomentRepository, MAX_INLINE_IMAGES, MAX_TEXT_LENGTH } = require('./momentRepository');
const { fetchRemoteImage, isPrivateIp, sniffImageMime } = require('./remoteImage');
const { presentMoment } = require('./presenter');

const OWNER_UUID = 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552';
const OTHER_UUID = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const THIRD_UUID = '635fb145-0a90-47f3-a3be-640e1be84f2d';

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-moment-repository-'));
  let now = Date.parse('2026-09-14T08:00:00.000Z');
  const repository = new MomentRepository({
    dataFile: path.join(directory, 'moments.json'),
    uploadDirectory: path.join(directory, 'uploads'),
    now: () => now
  });
  return { directory, repository, setNow: (value) => (now = Date.parse(value)) };
}

async function cleanupFixture(fixture) {
  await fixture.repository.writeQueue;
  await fixture.repository.cleanupQueue;
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('creates persistent mixed-media moments and lists them newest first', async () => {
  const fixture = createFixture();
  try {
    const first = await fixture.repository.createMoment(
      { ownerUuid: OWNER_UUID, text: '第一条星语', location: { latitude: 39.9, longitude: 116.4, label: '北京' } },
      { media: [{ buffer: Buffer.from('image-one'), mimeType: 'image/jpeg', name: 'sunset.jpg' }] }
    );
    fixture.setNow('2026-09-14T09:00:00.000Z');
    const second = await fixture.repository.createMoment(
      { ownerUuid: OTHER_UUID, text: '', voiceDurationMs: 4200 },
      { voice: { buffer: Buffer.from('voice-one'), mimeType: 'audio/webm', name: 'voice.webm' } }
    );

    const result = fixture.repository.listMoments({ page: 1, pageSize: 10 });
    assert.deepEqual(result.items.map((item) => item.id), [second.id, first.id]);
    assert.equal(result.total, 2);
    assert.equal(result.hasMore, false);
    assert.equal(fs.existsSync(path.join(fixture.directory, first.media[0].url.replace('/uploads/moments/', 'uploads/'))), true);

    const reloaded = new MomentRepository({ dataFile: path.join(fixture.directory, 'moments.json'), uploadDirectory: path.join(fixture.directory, 'uploads') });
    assert.equal(reloaded.getMoment(second.id).voice.durationMs, 4200);
    assert.equal(reloaded.getMoment(first.id).location.label, '北京');
  } finally {
    await cleanupFixture(fixture);
  }
});

test('shows two comments by default, keeps replies flat, and enforces comment ownership', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '评论测试' });
    const first = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '第一条' });
    fixture.setNow('2026-09-14T08:01:00.000Z');
    const second = await fixture.repository.createComment(moment.id, OTHER_UUID, { text: '回复第一条', replyToCommentId: first.id });
    fixture.setNow('2026-09-14T08:02:00.000Z');
    const third = await fixture.repository.createComment(moment.id, THIRD_UUID, { text: '第三条' });

    const presented = presentMoment(fixture.repository.getMoment(moment.id), { uuid: OTHER_UUID, isAdmin: false }, { commentLimit: 2 });
    assert.equal(presented.commentCount, 3);
    assert.deepEqual(presented.comments.map((comment) => comment.id), [first.id, second.id]);
    assert.equal(presented.comments[1].replyTo.userId, 'unknown');
    assert.equal(presented.comments[1].canEdit, true);
    assert.equal(presented.comments[0].canDelete, false);

    await assert.rejects(() => fixture.repository.updateComment(moment.id, first.id, OTHER_UUID, { text: '不能修改' }), { code: 'COMMENT_FORBIDDEN' });
    const updated = await fixture.repository.updateComment(moment.id, first.id, OWNER_UUID, { text: '已经修改' });
    assert.equal(updated.text, '已经修改');
    assert.notEqual(updated.updatedAt, updated.createdAt);

    await assert.rejects(() => fixture.repository.deleteComment(moment.id, third.id, OTHER_UUID), { code: 'COMMENT_FORBIDDEN' });
    await fixture.repository.deleteComment(moment.id, third.id, '', { isAdmin: true });
    assert.deepEqual(fixture.repository.listComments(moment.id).map((comment) => comment.id), [first.id, second.id]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('comment previews preserve publication order through expansion, edits, and deletion refills', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '评论预览排序' });
    // Equal timestamps still retain insertion order instead of ordering by random IDs.
    const first = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '第一条' });
    const second = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '第二条' });
    const third = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '第三条' });
    const preview = () => presentMoment(fixture.repository.getMoment(moment.id), { uuid: OWNER_UUID }, { commentLimit: 2 });

    assert.deepEqual(preview().comments.map((item) => item.id), [first.id, second.id]);
    assert.equal(preview().commentCount, 3);
    assert.deepEqual(fixture.repository.listComments(moment.id).map((item) => item.id), [first.id, second.id, third.id]);

    fixture.setNow('2026-09-14T08:03:00.000Z');
    await fixture.repository.updateComment(moment.id, first.id, OWNER_UUID, { text: '编辑第一条不改变顺序' });
    const fourth = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '第四条不会挤掉预览' });
    assert.deepEqual(preview().comments.map((item) => item.id), [first.id, second.id]);
    assert.equal(preview().comments[0].text, '编辑第一条不改变顺序');
    assert.equal(preview().commentCount, 4);

    await fixture.repository.deleteComment(moment.id, first.id, OWNER_UUID);
    assert.deepEqual(preview().comments.map((item) => item.id), [second.id, third.id]);
    assert.equal(preview().commentCount, 3);
    assert.deepEqual(fixture.repository.listComments(moment.id).map((item) => item.id), [second.id, third.id, fourth.id]);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('deleting a reply target retains replies and clears their dangling attribution after reload', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '删除回复目标' });
    const first = await fixture.repository.createComment(moment.id, OWNER_UUID, { text: '待删除评论' });
    const second = await fixture.repository.createComment(moment.id, OTHER_UUID, { text: '保留回复', replyToCommentId: first.id });
    const third = await fixture.repository.createComment(moment.id, THIRD_UUID, { text: '其他回复不受影响', replyToCommentId: second.id });

    await fixture.repository.deleteComment(moment.id, first.id, OWNER_UUID);
    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    const comments = reloaded.listComments(moment.id);
    assert.deepEqual(comments.map((item) => item.id), [second.id, third.id]);
    assert.equal(comments[0].replyToCommentId, '');
    assert.equal(comments[0].replyToOwnerUuid, '');
    assert.equal(comments[1].replyToCommentId, second.id);
    assert.equal(comments[1].replyToOwnerUuid, OTHER_UUID);
    assert.equal(presentMoment(reloaded.getMoment(moment.id)).comments[0].replyTo, null);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('only the publisher or a super admin can delete a whole moment and its attachments', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment(
      { ownerUuid: OWNER_UUID, text: '待删除' },
      {
        media: [{ buffer: Buffer.from('video-one'), mimeType: 'video/mp4', name: 'walk.mp4' }],
        voice: { buffer: Buffer.from('voice-one'), mimeType: 'audio/mpeg', name: 'note.mp3' }
      }
    );
    const mediaPath = path.join(fixture.directory, moment.media[0].url.replace('/uploads/moments/', 'uploads/'));
    const voicePath = path.join(fixture.directory, moment.voice.url.replace('/uploads/moments/', 'uploads/'));
    assert.equal(fs.existsSync(mediaPath), true);
    assert.equal(fs.existsSync(voicePath), true);

    await assert.rejects(() => fixture.repository.deleteMoment(moment.id, OTHER_UUID), { code: 'MOMENT_FORBIDDEN' });
    await fixture.repository.deleteMoment(moment.id, '', { isAdmin: true });
    assert.equal(fixture.repository.getMoment(moment.id), null);
    assert.equal(fs.existsSync(mediaPath), false);
    assert.equal(fs.existsSync(voicePath), false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('deleting a profile removes its moments, authored comments, and dangling reply labels', async () => {
  const fixture = createFixture();
  try {
    const ownedMoment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '会随人员删除' });
    await fixture.repository.createComment(ownedMoment.id, OTHER_UUID, { text: '星河内的评论' });
    const retainedMoment = await fixture.repository.createMoment({ ownerUuid: OTHER_UUID, text: '应继续保留' });
    const authoredComment = await fixture.repository.createComment(retainedMoment.id, OWNER_UUID, { text: '需要清理的评论' });
    const retainedReply = await fixture.repository.createComment(retainedMoment.id, THIRD_UUID, { text: '保留的回复', replyToCommentId: authoredComment.id });

    const result = await fixture.repository.deleteByOwner(OWNER_UUID);

    assert.deepEqual(result, { count: 1, commentCount: 2 });
    assert.equal(fixture.repository.getMoment(ownedMoment.id), null);
    const comments = fixture.repository.listComments(retainedMoment.id);
    assert.deepEqual(comments.map((comment) => comment.id), [retainedReply.id]);
    assert.equal(comments[0].replyToCommentId, '');
    assert.equal(comments[0].replyToOwnerUuid, '');
  } finally {
    await cleanupFixture(fixture);
  }
});

test('rejects empty moments and unsupported attachments', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(() => fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '   ' }), { code: 'MOMENT_CONTENT_EMPTY' });
    await assert.rejects(
      () => fixture.repository.createMoment({ ownerUuid: OWNER_UUID }, { media: [{ buffer: Buffer.from('bad'), mimeType: 'application/pdf', name: 'bad.pdf' }] }),
      { code: 'MOMENT_MEDIA_INVALID' }
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('persists 10000-character moments and rejects text beyond the limit', async () => {
  const fixture = createFixture();
  try {
    const text = '心'.repeat(MAX_TEXT_LENGTH);
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text });
    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    assert.equal(reloaded.getMoment(moment.id).text, text);
    await assert.rejects(
      () => fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: `${text}迹` }),
      { code: 'MOMENT_TEXT_INVALID', message: `星语文字不能超过 ${MAX_TEXT_LENGTH} 个字符` }
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('persists interleaved text and inline image blocks, supports search, enforces 30-image cap, and cleans up files on delete', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment(
      {
        ownerUuid: OWNER_UUID,
        blocks: [
          { type: 'text', text: '第一段说明' },
          { type: 'image', inlineIndex: 0, alt: '步骤图一' },
          { type: 'text', text: '第二段补充' },
          { type: 'image', inlineIndex: 1, alt: '步骤图二' }
        ]
      },
      {
        inlineImages: [
          { buffer: Buffer.from('inline-one'), mimeType: 'image/png', name: 'step1.png' },
          { buffer: Buffer.from('inline-two'), mimeType: 'image/jpeg', name: 'step2.jpg' }
        ]
      }
    );

    assert.equal(moment.text, '第一段说明\n\n第二段补充');
    assert.equal(moment.blocks.length, 4);
    assert.equal(moment.blocks[1].type, 'image');
    assert.equal(moment.blocks[1].alt, '步骤图一');

    const img1Path = path.join(fixture.directory, moment.blocks[1].url.replace('/uploads/moments/', 'uploads/'));
    const img2Path = path.join(fixture.directory, moment.blocks[3].url.replace('/uploads/moments/', 'uploads/'));
    assert.equal(fs.existsSync(img1Path), true);
    assert.equal(fs.existsSync(img2Path), true);

    const searchResult = fixture.repository.listMoments({ search: '第二段补充' });
    assert.deepEqual(searchResult.items.map((item) => item.id), [moment.id]);

    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    const presented = presentMoment(reloaded.getMoment(moment.id), { uuid: OWNER_UUID });
    assert.equal(presented.blocks.length, 4);
    assert.equal(presented.blocks[3].url, moment.blocks[3].url);

    // Reject more than 30 inline images.
    const tooManyBlocks = Array.from({ length: MAX_INLINE_IMAGES + 1 }, (_, i) => ({ type: 'image', inlineIndex: i }));
    const tooManyFiles = Array.from({ length: MAX_INLINE_IMAGES + 1 }, (_, i) => ({ buffer: Buffer.from(`img-${i}`), mimeType: 'image/png', name: `p-${i}.png` }));
    await assert.rejects(
      () => fixture.repository.createMoment({ ownerUuid: OWNER_UUID, blocks: tooManyBlocks }, { inlineImages: tooManyFiles }),
      { code: 'MOMENT_MEDIA_INVALID' }
    );

    // Delete cleans up all inline image files.
    await fixture.repository.deleteMoment(moment.id, OWNER_UUID);
    assert.equal(fs.existsSync(img1Path), false);
    assert.equal(fs.existsSync(img2Path), false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('owner and super admin can edit a moment, keeping or replacing inline images while cleaning removed files', async () => {
  const fixture = createFixture();
  try {
    const original = await fixture.repository.createMoment(
      {
        ownerUuid: OWNER_UUID,
        blocks: [
          { type: 'text', text: '原始段落' },
          { type: 'image', inlineIndex: 0, alt: '旧图1' },
          { type: 'image', inlineIndex: 1, alt: '旧图2' }
        ]
      },
      {
        inlineImages: [
          { buffer: Buffer.from('old-1'), mimeType: 'image/png', name: 'old1.png' },
          { buffer: Buffer.from('old-2'), mimeType: 'image/png', name: 'old2.png' }
        ]
      }
    );

    const img1 = original.blocks[1];
    const img2 = original.blocks[2];
    const img1Path = path.join(fixture.directory, img1.url.replace('/uploads/moments/', 'uploads/'));
    const img2Path = path.join(fixture.directory, img2.url.replace('/uploads/moments/', 'uploads/'));

    // Non-owner non-admin cannot edit.
    await assert.rejects(
      () => fixture.repository.updateMoment(original.id, OTHER_UUID, { text: '越权编辑' }),
      { code: 'MOMENT_FORBIDDEN' }
    );
    assert.equal(presentMoment(original, { uuid: OWNER_UUID, isAdmin: false }).canEdit, true);
    assert.equal(presentMoment(original, { uuid: OTHER_UUID, isAdmin: false }).canEdit, false);
    assert.equal(presentMoment(original, { uuid: OTHER_UUID, isAdmin: true }).canEdit, true);

    // Owner edits: keeps img1, removes img2, adds a new img3 and new text.
    fixture.setNow('2026-09-14T10:00:00.000Z');
    const edited = await fixture.repository.updateMoment(
      original.id,
      OWNER_UUID,
      {
        blocks: [
          { type: 'text', text: '修改后的段落' },
          { type: 'image', existingId: img1.id, alt: '保留图1' },
          { type: 'text', text: '新增后文' },
          { type: 'image', inlineIndex: 0, alt: '新图3' }
        ],
        keepMediaIds: []
      },
      {
        inlineImages: [{ buffer: Buffer.from('new-3'), mimeType: 'image/jpeg', name: 'new3.jpg' }]
      }
    );

    assert.equal(edited.text, '修改后的段落\n\n新增后文');
    assert.equal(edited.blocks.length, 4);
    assert.equal(edited.blocks[1].id, img1.id);
    assert.equal(edited.blocks[1].url, img1.url);
    const img3Path = path.join(fixture.directory, edited.blocks[3].url.replace('/uploads/moments/', 'uploads/'));
    assert.equal(fs.existsSync(img1Path), true);
    assert.equal(fs.existsSync(img2Path), false);
    assert.equal(fs.existsSync(img3Path), true);
    assert.equal(presentMoment(edited, { uuid: OWNER_UUID }).isEdited, true);

    // Super admin can edit another user's moment without being owner.
    fixture.setNow('2026-09-14T11:00:00.000Z');
    const adminEdited = await fixture.repository.updateMoment(
      original.id,
      OTHER_UUID,
      { text: '管理员修订正文', blocks: [], keepMediaIds: [] },
      {},
      { isAdmin: true }
    );
    assert.equal(adminEdited.text, '管理员修订正文');
    assert.equal(adminEdited.blocks, undefined);
    assert.equal(fs.existsSync(img1Path), false);
    assert.equal(fs.existsSync(img3Path), false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('remoteImage blocks private IPs/SSRF, validates redirect targets, and sniffs real image bytes', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, `${ip} must be blocked`);
  }
  assert.equal(isPrivateIp('93.184.216.34'), false);

  await assert.rejects(() => fetchRemoteImage('http://127.0.0.1/secret.png'), { code: 'MOMENT_IMAGE_URL_BLOCKED' });
  await assert.rejects(() => fetchRemoteImage('http://localhost:3000/a.png'), { code: 'MOMENT_IMAGE_URL_BLOCKED' });
  await assert.rejects(() => fetchRemoteImage('file:///etc/passwd'), { code: 'MOMENT_IMAGE_URL_INVALID' });

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniffImageMime(pngBytes), 'image/png');
  assert.equal(sniffImageMime(Buffer.from('<html><body>login required</body></html>')), '');

  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
  // Reject HTML disguised as 200 OK.
  await assert.rejects(
    () => fetchRemoteImage('https://example.com/pic.png', {
      lookup: publicLookup,
      fetchImpl: async () => new Response('<html>not an image</html>', { status: 200, headers: { 'content-type': 'image/png' } })
    }),
    { code: 'MOMENT_MEDIA_INVALID' }
  );
  // Block redirect to private IP.
  await assert.rejects(
    () => fetchRemoteImage('https://example.com/redirect', {
      lookup: publicLookup,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
    }),
    { code: 'MOMENT_IMAGE_URL_BLOCKED' }
  );
  // Succeed on valid PNG from public IP.
  const fetched = await fetchRemoteImage('https://example.com/photo.png', {
    lookup: publicLookup,
    fetchImpl: async () => new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } })
  });
  assert.equal(fetched.mimeType, 'image/png');
  assert.equal(fetched.name, 'photo.png');
  assert.equal(fetched.buffer.equals(pngBytes), true);
});

test('likes are idempotent, independent per viewer, private, and persistent', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '点赞测试' });
    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true), { liked: true, likeCount: 1 });
    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true), { liked: true, likeCount: 1 });
    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OTHER_UUID, true), { liked: true, likeCount: 2 });

    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    const stored = reloaded.getMoment(moment.id);
    const ownView = presentMoment(stored, { uuid: OWNER_UUID });
    assert.equal(ownView.likeCount, 2);
    assert.equal(ownView.liked, true);
    assert.equal(presentMoment(stored, { uuid: THIRD_UUID }).liked, false);
    assert.equal(presentMoment(stored).liked, false);
    assert.equal('likedBy' in ownView, false);
    assert.equal(JSON.stringify(ownView).includes(OWNER_UUID), false);
    assert.equal(JSON.stringify(ownView).includes(OTHER_UUID), false);

    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OWNER_UUID, false), { liked: false, likeCount: 1 });
    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OWNER_UUID, false), { liked: false, likeCount: 1 });
    const remaining = fixture.repository.getMoment(moment.id);
    assert.equal(presentMoment(remaining, { uuid: OWNER_UUID }).liked, false);
    assert.equal(presentMoment(remaining, { uuid: OTHER_UUID }).liked, true);
    assert.deepEqual(await fixture.repository.setMomentLiked(moment.id, OTHER_UUID, false), { liked: false, likeCount: 0 });
  } finally {
    await cleanupFixture(fixture);
  }
});

test('concurrent likes across repository instances do not duplicate likes or lose comments', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '并发点赞' });
    const other = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    await Promise.all([
      fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true),
      other.setMomentLiked(moment.id, OTHER_UUID, true),
      fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true),
      other.createComment(moment.id, THIRD_UUID, { text: '并发评论应当保留' })
    ]);
    let stored = other.getMoment(moment.id);
    assert.deepEqual(new Set(stored.likedBy), new Set([OWNER_UUID, OTHER_UUID]));
    assert.equal(stored.likedBy.length, 2);
    assert.equal(stored.comments.length, 1);
    assert.equal(stored.comments[0].text, '并发评论应当保留');

    await Promise.all([
      fixture.repository.setMomentLiked(moment.id, OWNER_UUID, false),
      other.setMomentLiked(moment.id, OTHER_UUID, false),
      fixture.repository.setMomentLiked(moment.id, OWNER_UUID, false)
    ]);
    stored = fixture.repository.getMoment(moment.id);
    assert.deepEqual(stored.likedBy, []);
    assert.equal(stored.comments.length, 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('legacy moments without likes load as unliked and can persist their first like', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '旧版星河' });
    delete moment.likedBy;
    fs.writeFileSync(fixture.repository.dataFile, JSON.stringify({ version: 1, moments: [moment] }));
    const legacy = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    const view = presentMoment(legacy.getMoment(moment.id), { uuid: OWNER_UUID });
    assert.equal(view.likeCount, 0);
    assert.equal(view.liked, false);
    assert.deepEqual(await legacy.setMomentLiked(moment.id, OWNER_UUID, true), { liked: true, likeCount: 1 });
    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    assert.deepEqual(reloaded.getMoment(moment.id).likedBy, [OWNER_UUID]);
    assert.equal(reloaded.getMoment(moment.id).text, '旧版星河');
  } finally {
    await cleanupFixture(fixture);
  }
});

test('deleting a profile cleans its likes even when it owns no moments or comments', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OTHER_UUID, text: '保留的星河' });
    await fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true);
    await fixture.repository.setMomentLiked(moment.id, THIRD_UUID, true);
    assert.deepEqual(await fixture.repository.deleteByOwner(OWNER_UUID), { count: 0, commentCount: 0 });
    const reloaded = new MomentRepository({ dataFile: fixture.repository.dataFile, uploadDirectory: fixture.repository.uploadDirectory });
    assert.deepEqual(reloaded.getMoment(moment.id).likedBy, [THIRD_UUID]);
    assert.equal(presentMoment(reloaded.getMoment(moment.id), { uuid: OWNER_UUID }).liked, false);
    assert.equal(presentMoment(reloaded.getMoment(moment.id), { uuid: THIRD_UUID }).likeCount, 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('likes reject invalid IDs, invalid identities, nonboolean states, and missing moments', async () => {
  const fixture = createFixture();
  try {
    const moment = await fixture.repository.createMoment({ ownerUuid: OWNER_UUID, text: '参数校验' });
    await assert.rejects(() => fixture.repository.setMomentLiked('invalid', OWNER_UUID, true), { code: 'MOMENT_ID_INVALID' });
    await assert.rejects(() => fixture.repository.setMomentLiked(moment.id, 'invalid', true), { code: 'UUID_INVALID' });
    await assert.rejects(() => fixture.repository.setMomentLiked('A'.repeat(16), OWNER_UUID, true), { code: 'MOMENT_NOT_FOUND' });
    for (const liked of [undefined, null, 'true', 1, 0, {}]) {
      await assert.rejects(() => fixture.repository.setMomentLiked(moment.id, OWNER_UUID, liked), { code: 'MOMENT_LIKE_INVALID' });
    }
    assert.deepEqual(fixture.repository.getMoment(moment.id).likedBy, []);
    await fixture.repository.deleteMoment(moment.id, OWNER_UUID);
    await assert.rejects(() => fixture.repository.setMomentLiked(moment.id, OWNER_UUID, true), { code: 'MOMENT_NOT_FOUND' });
  } finally {
    await cleanupFixture(fixture);
  }
});

test('production deployment binds moment data and uploads to shared storage', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../../.github/workflows/nextjs.yml'), 'utf8');
  assert.match(workflow, /shared\/moment-data\/moments\.json/);
  assert.match(workflow, /shared\/soul-uploads\/moments/);
  assert.match(workflow, /export MOMENT_DATA_FILE=/);
  assert.match(workflow, /export MOMENT_UPLOAD_DIRECTORY=/);
});
