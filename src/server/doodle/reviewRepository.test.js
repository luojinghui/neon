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

    const adminRecord = (await fixture.repository.listAdminReviews())[0];
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
    assert.equal((await fixture.repository.listAdminReviews())[0].shareId, 'ShareId12345');

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
    const listed = await fixture.repository.listAdminReviews();
    await fixture.repository.cleanupQueue;
    assert.equal(listed[0].status, 'expired');
    assert.equal(listed[0].originalUrl, '');
    assert.equal(listed[0].processedUrl, '');
  } finally {
    await cleanup(fixture);
  }
});

test('serializes concurrent writers that share one moderation data file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-doodle-review-concurrency-'));
  const dataFile = path.join(directory, 'doodle-reviews.json');
  const uploadDirectory = path.join(directory, 'uploads');
  const firstRepository = new DoodleReviewRepository({ dataFile, uploadDirectory });
  const secondRepository = new DoodleReviewRepository({ dataFile, uploadDirectory });
  try {
    await Promise.all([
      firstRepository.createReview(
        {
          ownerUuid: OWNER_UUID,
          originalMimeType: 'image/jpeg',
          processedMimeType: 'image/jpeg',
          title: '并发记录一',
          style: 'sun-pop',
          template: 'comic-cover',
          reviewKey: REVIEW_KEY
        },
        Buffer.from('raw-one'),
        Buffer.from('processed-one')
      ),
      secondRepository.createReview(
        {
          ownerUuid: '22222222-2222-4222-8222-222222222222',
          originalMimeType: 'image/png',
          processedMimeType: 'image/png',
          title: '并发记录二',
          style: 'blue-hour',
          template: 'hero-poster',
          reviewKey: '44444444-4444-4444-8444-444444444444'
        },
        Buffer.from('raw-two'),
        Buffer.from('processed-two')
      )
    ]);

    const reloaded = new DoodleReviewRepository({ dataFile, uploadDirectory });
    const reviews = await reloaded.listAdminReviews();
    assert.equal(reviews.length, 2);
    assert.deepEqual(new Set(reviews.map((review) => review.title)), new Set(['并发记录一', '并发记录二']));
  } finally {
    await Promise.all([firstRepository.writeQueue, secondRepository.writeQueue]);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('does not turn corrupted moderation storage into an empty admin list', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-doodle-review-corrupt-'));
  const dataFile = path.join(directory, 'doodle-reviews.json');
  fs.writeFileSync(dataFile, '{not-json', 'utf8');
  const repository = new DoodleReviewRepository({ dataFile, uploadDirectory: path.join(directory, 'uploads') });
  try {
    await assert.rejects(repository.listAdminReviews(), { code: 'REVIEW_STORAGE_UNAVAILABLE' });
  } finally {
    await repository.writeQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reports missing review images without returning broken admin image URLs', async () => {
  const fixture = createFixture();
  try {
    const review = await fixture.repository.createReview(
      { ownerUuid: OWNER_UUID, originalMimeType: 'image/jpeg', processedMimeType: 'image/jpeg', title: '存储检查', style: 'sun-pop', template: 'comic-cover', reviewKey: REVIEW_KEY },
      Buffer.from('raw-photo'),
      Buffer.from('processed-photo')
    );
    fs.unlinkSync(path.join(fixture.uploadDirectory, `${review.id}-original.jpg`));

    const listed = await fixture.repository.listAdminReviews();
    assert.equal(listed[0].imageState, 'missing');
    assert.equal(listed[0].originalUrl, '');
    assert.equal(listed[0].processedUrl, `/api/admin/doodles/${review.id}/image/processed`);
    assert.throws(() => fixture.repository.getAdminImage(review.id, 'original'), { code: 'REVIEW_IMAGE_MISSING' });
  } finally {
    await cleanup(fixture);
  }
});

test('returns a storage error and rolls back a review when persistence fails', async () => {
  const fixture = createFixture();
  const persistUnlocked = fixture.repository.persistUnlocked.bind(fixture.repository);
  fixture.repository.persistUnlocked = async () => {
    throw new Error('simulated disk failure');
  };
  try {
    await assert.rejects(
      fixture.repository.createReview(
        { ownerUuid: OWNER_UUID, originalMimeType: 'image/jpeg', processedMimeType: 'image/jpeg', title: '不能假成功', style: 'sun-pop', template: 'comic-cover', reviewKey: REVIEW_KEY },
        Buffer.from('raw-photo'),
        Buffer.from('processed-photo')
      ),
      { code: 'REVIEW_STORAGE_UNAVAILABLE' }
    );
    assert.equal(fs.existsSync(fixture.uploadDirectory) ? fs.readdirSync(fixture.uploadDirectory).length : 0, 0);
  } finally {
    fixture.repository.persistUnlocked = persistUnlocked;
    await cleanup(fixture);
  }
});

test('production deployment binds doodle data and review images to shared storage', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../../.github/workflows/nextjs.yml'), 'utf8');
  assert.match(workflow, /shared\/doodle-data\/doodle-reviews\.json/);
  assert.match(workflow, /shared\/doodle-review-images/);
  assert.match(workflow, /export DOODLE_REVIEW_DATA_FILE=/);
  assert.match(workflow, /export DOODLE_REVIEW_UPLOAD_DIRECTORY=/);
  assert.match(workflow, /export DOODLE_SHARE_DATA_FILE=/);
  assert.match(workflow, /export DOODLE_UPLOAD_DIRECTORY=/);
  const startRelease = workflow.slice(workflow.indexOf('          start_release()'), workflow.indexOf('          ln -sfn "${release_dir}"'));
  assert.match(startRelease, /stop_release \|\| return 1[\s\S]*deployment-data-backup\.cjs[\s\S]*migrate_doodle_storage[\s\S]*pm2 start/);
});
