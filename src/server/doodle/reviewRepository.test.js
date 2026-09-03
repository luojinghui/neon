const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DoodleReviewRepository, REVIEW_LIFETIME_MS } = require('./reviewRepository');

const OWNER_UUID = '11111111-1111-4111-8111-111111111111';
const REVIEW_KEY = '33333333-3333-4333-8333-333333333333';

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-doodle-reviews-'));
  let now = Date.parse('2026-09-03T08:00:00.000Z');
  const uploadDirectory = path.join(directory, 'uploads');
  const repository = new DoodleReviewRepository({
    dataFile: path.join(directory, 'doodle-reviews.json'),
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

test('stores original and processed images as a paired moderation record', async () => {
  const fixture = createFixture();
  try {
    const review = await fixture.repository.createReview(
      {
        ownerUuid: OWNER_UUID,
        originalMimeType: 'image/jpeg',
        processedMimeType: 'image/jpeg',
        title: '今天是摸鱼勇者',
        style: 'sun-pop',
        template: 'comic-cover',
        reviewKey: REVIEW_KEY
      },
      Buffer.from('raw-photo'),
      Buffer.from('processed-photo')
    );
    assert.equal(review.status, 'pending');
    assert.equal(Date.parse(review.expiresAt) - Date.parse(review.createdAt), REVIEW_LIFETIME_MS);
    assert.equal(fs.readFileSync(path.join(fixture.uploadDirectory, `${review.id}-original.jpg`), 'utf8'), 'raw-photo');
    assert.equal(fs.readFileSync(path.join(fixture.uploadDirectory, `${review.id}-processed.jpg`), 'utf8'), 'processed-photo');

    const adminRecord = fixture.repository.listAdminReviews()[0];
    assert.equal(adminRecord.ownerUuid, OWNER_UUID);
    assert.equal(adminRecord.originalUrl, `/api/admin/doodles/${review.id}/image/original`);
    assert.equal(adminRecord.processedUrl, `/api/admin/doodles/${review.id}/image/processed`);
  } finally {
    await cleanup(fixture);
  }
});

test('updates the current processed image and rejected moderation removes both images', async () => {
  const fixture = createFixture();
  try {
    const review = await fixture.repository.createReview(
      { ownerUuid: OWNER_UUID, originalMimeType: 'image/jpeg', processedMimeType: 'image/jpeg', title: '旧称号', style: 'sun-pop', template: 'comic-cover', reviewKey: REVIEW_KEY },
      Buffer.from('raw-photo'),
      Buffer.from('first-poster')
    );
    await fixture.repository.updateProcessed(
      review.id,
      OWNER_UUID,
      { processedMimeType: 'image/jpeg', title: '新称号', style: 'grape-dream', template: 'sticker-book', shareId: 'ShareId12345' },
      Buffer.from('latest-poster')
    );
    assert.equal(fs.readFileSync(path.join(fixture.uploadDirectory, `${review.id}-processed.jpg`), 'utf8'), 'latest-poster');
    assert.equal(fixture.repository.listAdminReviews()[0].shareId, 'ShareId12345');

    await fixture.repository.moderateReview(review.id, 'approved', 'admin-id');
    const rejected = await fixture.repository.moderateReview(review.id, 'rejected', 'admin-id');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.originalUrl, '');
    assert.equal(rejected.processedUrl, '');
    assert.equal(fs.existsSync(path.join(fixture.uploadDirectory, `${review.id}-original.jpg`)), false);
    assert.equal(fs.existsSync(path.join(fixture.uploadDirectory, `${review.id}-processed.jpg`)), false);
  } finally {
    await cleanup(fixture);
  }
});

test('expired moderation records automatically remove their images', async () => {
  const fixture = createFixture();
  try {
    const review = await fixture.repository.createReview(
      { ownerUuid: OWNER_UUID, originalMimeType: 'image/png', processedMimeType: 'image/webp', title: '好运信号接收员', style: 'mint-party', template: 'instant-film', reviewKey: REVIEW_KEY },
      Buffer.from('raw-photo'),
      Buffer.from('processed-photo')
    );
    fixture.setNow(Date.parse(review.expiresAt) + 1);
    const listed = fixture.repository.listAdminReviews();
    await fixture.repository.cleanupQueue;
    assert.equal(listed[0].status, 'expired');
    assert.equal(listed[0].originalUrl, '');
    assert.equal(listed[0].processedUrl, '');
  } finally {
    await cleanup(fixture);
  }
});
