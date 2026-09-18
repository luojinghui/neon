const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { RoomRepository } = require('../chat/roomRepository');

function createFixture(t, { anotherTab = false, storageBlocked = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-admin-session-'));
  const repository = new RoomRepository({ dataFile: path.join(directory, 'chat.json'), uploadDirectory: path.join(directory, 'uploads') });
  const owner = { id: 'guest-owner', userId: 'Host01', publicKey: 'host-key', name: '创建者' };
  const visitor = { id: 'guest-visitor', userId: 'Guest01', publicKey: 'guest-key', name: '访客' };
  const room = repository.createRoom({ name: '密码星球', passwordEnabled: true, password: 'AB12' }, owner);
  const windows = [];
  const storedValues = new Map();
  const sockets = [];
  let sessionIsAdmin = false;
  let loginSucceeds = true;

  // The server authenticates a socket from the cookie once at handshake time.
  class ChatSocket extends EventEmitter {
    connected = false;
    authenticatedAdmin = false;
    handshakes = 0;
    connect() {
      this.authenticatedAdmin = sessionIsAdmin;
      this.handshakes += 1;
      queueMicrotask(() => {
        this.connected = true;
        super.emit('connect');
      });
      return this;
    }
    disconnect() {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) super.emit('disconnect');
      return this;
    }
    emit(event, ...args) {
      if (event !== 'room:join') return super.emit(event, ...args);
      const [payload, ack] = args;
      try {
        const joined = repository.verifyRoomAccess(payload.roomId, payload.password, { user: visitor, isAdmin: this.authenticatedAdmin });
        ack({ ok: true, data: { room: repository.toPublicRoom(joined), messages: [] } });
      } catch (error) {
        ack({ ok: false, code: error.code, error: error.message });
      }
      return true;
    }
  }

  function createTab() {
    const window = new EventTarget();
    windows.push(window);
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    window.localStorage = {
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage is blocked');
        storedValues.set(key, value);
        for (const otherWindow of windows) {
          if (otherWindow === window) continue;
          const event = new Event('storage');
          event.key = key;
          event.newValue = value;
          otherWindow.dispatchEvent(event);
        }
      }
    };
    const modules = new Map();
    function load(relativeFile) {
      const filename = path.resolve(__dirname, '../../app', relativeFile);
      if (modules.has(filename)) return modules.get(filename).exports;
      const compiledModule = { exports: {} };
      modules.set(filename, compiledModule);
      const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText;
      vm.runInNewContext(compiled, {
        module: compiledModule, exports: compiledModule.exports, window, Event, Headers,
        async fetch(url, options) {
          if (url.endsWith('/login') && options.method === 'POST') {
            if (!loginSucceeds) return { ok: false, status: 401, json: async () => ({ error: '登录失败' }) };
            sessionIsAdmin = true;
            return { ok: true, status: 200, json: async () => ({ admin: { role: 'super_admin' } }) };
          }
          if (url.endsWith('/session') && options.method === 'DELETE') {
            sessionIsAdmin = false;
            return { ok: true, status: 204 };
          }
          return { ok: true, status: 200, json: async () => ({}) };
        },
        require(name) {
          if (name === 'socket.io-client') return { io: () => { const socket = new ChatSocket(); sockets.push(socket); return socket; } };
          return load(path.relative(path.resolve(__dirname, '../../app'), path.resolve(path.dirname(filename), `${name}.ts`)));
        }
      }, { filename });
      return compiledModule.exports;
    }
    return { window, load };
  }

  const chatTab = createTab();
  const adminTab = anotherTab ? createTab() : chatTab;
  const { SocketChatTransport } = chatTab.load('soul/core/socketTransport.ts');
  const { adminRequest } = adminTab.load('admin/client.ts');
  const transport = new SocketChatTransport();
  t.after(async () => {
    transport.disconnect();
    await repository.writeQueue;
    await repository.cleanupQueue;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { transport, adminRequest, visitor, room, sockets, storedValues, chatTab, setLoginSucceeds(value) { loginSucceeds = value; } };
}

for (const anotherTab of [false, true]) {
  test(`admin login and logout refresh an open chat socket from ${anotherTab ? 'another tab' : 'the same tab'}`, async (t) => {
    const fixture = createFixture(t, { anotherTab });
    const { transport, adminRequest, visitor, room, sockets } = fixture;
    await transport.connect(visitor);
    await assert.rejects(transport.joinRoom(room.id), { code: 'ROOM_PASSWORD_REQUIRED' });

    await adminRequest('/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'private-password' }) });
    assert.equal((await transport.joinRoom(room.id)).room.id, room.id);
    assert.equal(sockets[0].handshakes, 2);
    assert.equal(JSON.stringify([...fixture.storedValues.values()]).includes('private-password'), false);

    await adminRequest('/session', { method: 'DELETE' });
    await assert.rejects(transport.joinRoom(room.id), { code: 'ROOM_PASSWORD_REQUIRED' });
    assert.equal(sockets[0].handshakes, 3);

    transport.disconnect();
    await adminRequest('/login', { method: 'POST' });
    assert.equal(sockets[0].handshakes, 3, 'disposed transports must stop listening for session changes');
  });
}

test('failed logins and unrelated storage changes leave chat connections intact', async (t) => {
  const fixture = createFixture(t);
  await fixture.transport.connect(fixture.visitor);
  fixture.setLoginSucceeds(false);
  await assert.rejects(fixture.adminRequest('/login', { method: 'POST' }));
  const event = new Event('storage');
  event.key = 'some-other-preference';
  fixture.chatTab.window.dispatchEvent(event);
  assert.equal(fixture.sockets[0].handshakes, 1);
  await assert.rejects(fixture.transport.joinRoom(fixture.room.id), { code: 'ROOM_PASSWORD_REQUIRED' });
});

test('same-page admin login refreshes the chat even when browser storage is unavailable', async (t) => {
  const fixture = createFixture(t, { storageBlocked: true });
  await fixture.transport.connect(fixture.visitor);
  await fixture.adminRequest('/login', { method: 'POST' });
  assert.equal((await fixture.transport.joinRoom(fixture.room.id)).room.id, fixture.room.id);
});
