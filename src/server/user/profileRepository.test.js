const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ProfileRepository } = require('./profileRepository');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-profile-repository-'));
  const repository = new ProfileRepository({ dataFile: path.join(directory, 'profiles.json') });
  return { directory, repository };
}

async function cleanupFixture(fixture) {
  await fixture.repository.writeQueue;
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

test('creates one stable profile for a browser uuid', async () => {
  const fixture = createFixture();
  try {
    const uuid = 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552';
    const first = fixture.repository.ensureProfile({ uuid });
    const second = fixture.repository.ensureProfile({ uuid, userId: 'IgnoredId' });
    assert.equal(first.userId, second.userId);
    assert.equal(first.publicKey, second.publicKey);
    assert.match(first.userId, /^[A-Za-z0-9]{3,20}$/);
    assert.equal('uuid' in fixture.repository.toPublic(first), false);
  } finally {
    await cleanupFixture(fixture);
  }
});

test('allows alphanumeric userId changes while keeping ownership uuid stable', async () => {
  const fixture = createFixture();
  try {
    const uuid = 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552';
    const profile = fixture.repository.ensureProfile({ uuid });
    const updated = fixture.repository.updateProfile(uuid, {
      userId: 'Traveler2026',
      name: '橘子星人',
      bio: '在不同星球之间收集回声。',
      avatarUrl: '/uploads/profile/11111111-1111-4111-8111-111111111111.webp',
      banner: { type: 'preset', value: 'coral' }
    });
    assert.equal(updated.uuid, profile.uuid);
    assert.equal(updated.publicKey, profile.publicKey);
    assert.equal(fixture.repository.getByUserId('traveler2026').uuid, uuid);
    assert.equal(fixture.repository.getByPublicKey(profile.publicKey).userId, 'Traveler2026');
  } finally {
    await cleanupFixture(fixture);
  }
});

test('rejects duplicate userIds case-insensitively', async () => {
  const fixture = createFixture();
  try {
    const first = fixture.repository.ensureProfile({ uuid: 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552', userId: 'NeonUser' });
    const second = fixture.repository.ensureProfile({ uuid: 'c56a4180-65aa-42ec-a945-5fd21dec0538' });
    assert.throws(
      () =>
        fixture.repository.updateProfile(second.uuid, {
          userId: first.userId.toLowerCase(),
          name: '另一个人',
          bio: '',
          avatarUrl: '',
          banner: { type: 'preset', value: 'sunrise' }
        }),
      { code: 'USER_ID_TAKEN' }
    );
  } finally {
    await cleanupFixture(fixture);
  }
});
