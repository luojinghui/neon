const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(windows = []) {
  const listeners = {};
  const notifications = [];
  const opened = [];
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => { listeners[name] = handler; },
    registration: { showNotification: async (...args) => { notifications.push(args); } },
    clients: { matchAll: async () => windows, openWindow: async url => { opened.push(url); } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../..', 'public/push-worker.js'), 'utf8'), { self, URL });
  const dispatch = async (name, data) => {
    let operation;
    listeners[name]({ ...data, waitUntil: promise => { operation = promise; } });
    await operation;
  };
  return { dispatch, notifications, opened };
}

test('push events show notifications and malformed data still produces a visible notification', async () => {
  const f = worker();
  await f.dispatch('push', { data: { json: () => ({ title: 'Title', body: 'Message', url: '/soul/1?from=push', id: 'unique' }) } });
  assert.equal(f.notifications[0][0], 'Title');
  assert.equal(f.notifications[0][1].data.url, '/soul/1?from=push');
  assert.equal(f.notifications[0][1].tag, 'unique');
  await f.dispatch('push', { data: { json: () => { throw new Error(); }, text: () => 'Plain text' } });
  assert.equal(f.notifications[1][1].body, 'Plain text');
});

test('notification clicks focus existing target pages and restrict navigation to the site', async () => {
  let focused = false;
  let closed = false;
  const f = worker([{ url: 'https://example.test/moments', focus: async () => { focused = true; } }]);
  await f.dispatch('notificationclick', { notification: { close: () => { closed = true; }, data: { url: '/moments' } } });
  assert.ok(focused && closed);
  assert.equal(f.opened.length, 0);
  for (const url of ['https://evil.test', '//evil.test', 'javascript:alert(1)']) {
    await f.dispatch('notificationclick', { notification: { close() {}, data: { url } } });
    assert.equal(f.opened.at(-1), 'https://example.test/');
  }
  await f.dispatch('notificationclick', { notification: { close() {}, data: { url: '/soul/a?message=b' } } });
  assert.equal(f.opened.at(-1), 'https://example.test/soul/a?message=b');
});
