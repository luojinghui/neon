const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DoodleShareRepository, SHARE_LIFETIME_MS } = require('./shareRepository');

const OWNER_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';
const REVIEW_KEY = '33333333-3333-4333-8333-333333333333';

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-doodle-shares-'));
  const uploadDirectory = path.join(directory, 'uploads');
  let now = Date.parse('2026-09-03T08:00:00.000Z');
  const repository = new DoodleShareRepository({
    dataFile: path.join(directory, 'doodle-shares.json'),
    uploadDirectory,
    now: () => now
  });
  return { directory, uploadDirectory, repository, setNow: (value) => (now = value) };
}

async function cleanup(fixture) {
  await fixture.repository.writeQueue;
  await fixture.repository.cleanupQueue;
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('creates a private-owner share with a 30-day public lifecycle', async () => {
  const fixture = createFixture();
  try {
    const share = await fixture.repository.createShare(
      { ownerUuid: OWNER_UUID, mimeType: 'image/jpeg', title: '今天是摸鱼勇者', style: 'sun-pop', template: 'instant-film' },
      Buffer.from('poster-image')
    );
    assert.match(share.id, /^[A-Za-z0-9_-]{12}$/);
    assert.equal(Date.parse(share.expiresAt) - Date.parse(share.createdAt), SHARE_LIFETIME_MS);
    assert.equal(fs.readFileSync(path.join(fixture.uploadDirectory, `${share.id}.jpg`), 'utf8'), 'poster-image');

    const publicShare = fixture.repository.getShare(share.id);
    assert.equal(publicShare.title, '今天是摸鱼勇者');
    assert.equal(publicShare.template, 'instant-film');
    assert.equal(publicShare.state, 'active');
    assert.equal('ownerUuid' in publicShare, false);
    assert.equal(fixture.repository.getShare(share.id, OWNER_UUID).isOwner, true);
    assert.equal(fixture.repository.getShare(share.id, OTHER_UUID).isOwner, false);
  } finally {
    await cleanup(fixture);
  }
});

test('only the owner can update or delete a share', async () => {
  const fixture = createFixture();
  try {
    const share = await fixture.repository.createShare(
      { ownerUuid: OWNER_UUID, mimeType: 'image/jpeg', title: '旧称号', style: 'sun-pop' },
      Buffer.from('first')
    );
    await assert.rejects(
      fixture.repository.updateShare(share.id, OTHER_UUID, { mimeType: 'image/jpeg', title: '新称号', style: 'blue-hour' }, Buffer.from('second')),
      { code: 'SHARE_FORBIDDEN' }
    );

    const updated = await fixture.repository.updateShare(
      share.id,
      OWNER_UUID,
      { mimeType: 'image/jpeg', title: '新称号', style: 'blue-hour', template: 'hero-poster' },
      Buffer.from('second')
    );
    assert.equal(updated.title, '新称号');
    assert.equal(updated.template, 'hero-poster');
    assert.equal(fs.readFileSync(path.join(fixture.uploadDirectory, `${share.id}.jpg`), 'utf8'), 'second');

    await assert.rejects(fixture.repository.deleteShare(share.id, OTHER_UUID), { code: 'SHARE_FORBIDDEN' });
    await fixture.repository.deleteShare(share.id, OWNER_UUID);
    assert.equal(fixture.repository.getShare(share.id).state, 'deleted');
    assert.equal(fs.existsSync(path.join(fixture.uploadDirectory, `${share.id}.jpg`)), false);
  } finally {
    await cleanup(fixture);
  }
});

test('expired shares become tombstones and remove their image', async () => {
  const fixture = createFixture();
  try {
    const share = await fixture.repository.createShare(
      { ownerUuid: OWNER_UUID, mimeType: 'image/webp', title: '银河系松弛代表', style: 'mint-party' },
      Buffer.from('webp-image')
    );
    fixture.setNow(Date.parse(share.expiresAt) + 1);
    const expired = fixture.repository.getShare(share.id);
    await fixture.repository.cleanupQueue;
    assert.equal(expired.state, 'expired');
    assert.equal(expired.imageUrl, '');
    assert.equal(fs.existsSync(path.join(fixture.uploadDirectory, `${share.id}.webp`)), false);
    assert.deepEqual(fixture.repository.listOwnerShares(OWNER_UUID), []);
  } finally {
    await cleanup(fixture);
  }
});

test('admin moderation can revoke a public share through its review key', async () => {
  const fixture = createFixture();
  try {
    const share = await fixture.repository.createShare(
      { ownerUuid: OWNER_UUID, mimeType: 'image/png', title: '可爱超标观察员', style: 'grape-dream', template: 'sticker-book', reviewKey: REVIEW_KEY },
      Buffer.from('moderated-image')
    );
    const listed = fixture.repository.listAdminShares();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].ownerUuid, OWNER_UUID);
    assert.equal(listed[0].template, 'sticker-book');
    assert.equal(listed[0].reviewKey, REVIEW_KEY);

    assert.equal(await fixture.repository.adminDeleteByReviewKey(REVIEW_KEY), 1);
    assert.equal(fixture.repository.getShare(share.id).state, 'deleted');
    assert.equal(fs.existsSync(path.join(fixture.uploadDirectory, `${share.id}.png`)), false);
  } finally {
    await cleanup(fixture);
  }
});
