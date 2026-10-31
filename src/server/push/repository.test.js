const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createECDH, randomBytes } = require('node:crypto');
const webpush = require('web-push');
const { PushRepository, normalizeSubscription, notificationInput } = require('./repository');

const profiles = [
  { uuid: 'd9428888-122b-4a8b-8a4b-0d2b0f4f3552', name: 'First', userId: 'First' },
  { uuid: 'c56a4180-65aa-42ec-a945-5fd21dec0538', name: 'Second', userId: 'Second' }
];
function subscription(id = 'a', provider = 'fcm.googleapis.com') {
  const key = createECDH('prime256v1'); key.generateKeys();
  return { endpoint: `https://${provider}/push/${id}`, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }, expirationTime: null };
}
async function fixture(t, sendNotification = async () => {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-push-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const options = { dataFile: path.join(directory, 'push.json'), env: {}, transport: { generateVAPIDKeys: webpush.generateVAPIDKeys, sendNotification } };
  return { repository: new PushRepository(options), options };
}
const draft = { title: '你好', body: '来自星球的消息', url: '/soul/abc?from=push#new', audience: 'all' };

test('concurrent processes retain one stable VAPID identity and all subscriptions', async t => {
  const { repository, options } = await fixture(t);
  const other = new PushRepository(options);
  const [first, second] = await Promise.all([repository.configuration(), other.configuration()]);
  assert.deepEqual(first, second);
  await Promise.all([repository.subscribe(profiles[0].uuid, subscription('a'), 'UA one'), other.subscribe(profiles[1].uuid, subscription('b'), 'UA two')]);
  const reloaded = new PushRepository(options);
  assert.equal((await reloaded.read()).subscriptions.length, 2);
  assert.equal((await reloaded.configuration()).publicKey, first.publicKey);
  const dashboard = await repository.dashboard(profiles);
  assert.equal(dashboard.recipients[0].devices[0].userAgent, 'UA one');
  assert.equal(JSON.stringify(dashboard).includes('p256dh'), false);
  assert.equal(JSON.stringify(dashboard).includes(first.privateKey), false);
});

test('deduplicates subscriptions and enforces unsubscribe ownership', async t => {
  const { repository } = await fixture(t);
  const item = subscription();
  await repository.subscribe(profiles[0].uuid, item, 'Original');
  const initialRevision = (await repository.read()).subscriptions[0].revision;
  await repository.subscribe(profiles[0].uuid, item, 'Updated');
  assert.equal((await repository.read()).subscriptions.length, 1);
  assert.equal((await repository.read()).subscriptions[0].revision, initialRevision);
  await repository.unsubscribe(profiles[1].uuid, item.endpoint);
  assert.equal((await repository.read()).subscriptions.length, 1);
  await repository.deleteUser(profiles[0].uuid);
  assert.equal((await repository.read()).subscriptions.length, 0);
});

test('targets only selected users, encrypts payload and cleans up only expired endpoints', async t => {
  const deliveries = [];
  const { repository } = await fixture(t, async (sub, payload, options) => {
    deliveries.push({ sub, payload, options });
    // Exercise the real library encryption/signing path without issuing network traffic.
    const request = webpush.generateRequestDetails(sub, payload, options);
    assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
    if (sub.endpoint.endsWith('/expired')) throw { statusCode: 410 };
  });
  await repository.subscribe(profiles[0].uuid, subscription('ok'), 'UA');
  await repository.subscribe(profiles[0].uuid, subscription('expired'), 'UA');
  await repository.subscribe(profiles[1].uuid, subscription('other'), 'UA');
  const message = await repository.send({ ...draft, audience: 'users', uuids: [profiles[0].uuid] }, profiles, 'admin');
  assert.equal(message.status, 'partial');
  assert.deepEqual([message.total, message.accepted, message.failed, message.expired], [2, 1, 1, 1]);
  assert.equal(deliveries.length, 2);
  assert.equal(JSON.parse(deliveries[0].payload).url, draft.url);
  assert.equal((await repository.read()).subscriptions.length, 2);
  assert.equal((await repository.dashboard(profiles)).messages[0].adminName, 'admin');
  assert.ok(!JSON.stringify(message).includes('privateKey'));
});

test('temporary provider errors retain subscriptions for retry, and empty/invalid audiences fail', async t => {
  const { repository } = await fixture(t, async () => { throw { statusCode: 503 }; });
  await assert.rejects(repository.send(draft, profiles, 'admin'), /没有有效/);
  await repository.subscribe(profiles[0].uuid, subscription(), 'UA');
  const result = await repository.send(draft, profiles, 'admin');
  assert.equal(result.status, 'failed');
  assert.equal((await repository.read()).subscriptions.length, 1);
  await assert.rejects(repository.send({ ...draft, audience: 'users', uuids: ['a'.repeat(36)] }, profiles, 'admin'), /不存在/);
});

test('rejects unsafe endpoints, malformed keys, external pages and empty messages', () => {
  for (const host of ['localhost', '127.0.0.1', '169.254.169.254', 'fcm.googleapis.com.evil.test']) assert.throws(() => normalizeSubscription(subscription('a', host)));
  for (const endpoint of ['http://fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a', 'https://u:p@fcm.googleapis.com/a']) assert.throws(() => normalizeSubscription({ ...subscription(), endpoint }));
  assert.throws(() => normalizeSubscription({ ...subscription(), keys: { auth: 'bad', p256dh: 'bad' } }));
  for (const url of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/pa\nth']) assert.throws(() => notificationInput({ ...draft, url }));
  assert.throws(() => notificationInput({ ...draft, title: '' }));
  assert.throws(() => notificationInput({ ...draft, audience: 'users', uuids: [] }));
  assert.equal(notificationInput({ ...draft, uuids: ['ignored'] }).uuids.length, 0);
});

test('key rotation excludes old subscriptions until the browser resubscribes', async t => {
  const { repository, options } = await fixture(t);
  const sub = subscription();
  await repository.subscribe(profiles[0].uuid, sub, 'UA');
  const pair = webpush.generateVAPIDKeys();
  const rotated = new PushRepository({ ...options, env: { WEB_PUSH_VAPID_PUBLIC_KEY: pair.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: pair.privateKey } });
  assert.equal((await rotated.dashboard(profiles)).recipients[0].subscriptionCount, 0);
  await rotated.subscribe(profiles[0].uuid, sub, 'UA');
  assert.equal((await rotated.dashboard(profiles)).recipients[0].subscriptionCount, 1);
});

test('broken storage fails without replacing identity or losing subscriptions', async t => {
  const { repository } = await fixture(t);
  await fs.writeFile(repository.dataFile, '{broken');
  await assert.rejects(repository.configuration());
  assert.equal(await fs.readFile(repository.dataFile, 'utf8'), '{broken');
});

test('concurrent sends are rejected and interrupted sends remain visibly unknown', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const { repository } = await fixture(t, async () => { started(); await gate; });
  await repository.subscribe(profiles[0].uuid, subscription(), 'UA');
  const first = repository.send(draft, profiles, 'admin');
  await ready;
  await assert.rejects(repository.send(draft, profiles, 'admin'), /仍在发送/);
  release();
  await first;
  await repository.mutate(state => { state.messages[0].status = 'sending'; state.messages[0].createdAt = new Date(Date.now() - 11 * 60 * 1000).toISOString(); });
  assert.equal((await repository.dashboard(profiles)).messages[0].status, 'interrupted');
});
