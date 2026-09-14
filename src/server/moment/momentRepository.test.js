const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { MomentRepository } = require('./momentRepository');
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
      { ownerUuid: OWNER_UUID, text: '第一条心迹', location: { latitude: 39.9, longitude: 116.4, label: '北京' } },
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
    assert.deepEqual(presented.comments.map((comment) => comment.id), [second.id, third.id]);
    assert.equal(presented.comments[0].replyTo.userId, 'unknown');
    assert.equal(presented.comments[0].canEdit, true);
    assert.equal(presented.comments[1].canDelete, false);

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
    await fixture.repository.createComment(ownedMoment.id, OTHER_UUID, { text: '心迹内的评论' });
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

test('production deployment binds moment data and uploads to shared storage', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../../.github/workflows/nextjs.yml'), 'utf8');
  assert.match(workflow, /shared\/moment-data\/moments\.json/);
  assert.match(workflow, /shared\/soul-uploads\/moments/);
  assert.match(workflow, /export MOMENT_DATA_FILE=/);
  assert.match(workflow, /export MOMENT_UPLOAD_DIRECTORY=/);
});
