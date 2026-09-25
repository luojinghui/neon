const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const { CallSignaling } = require('./callSignaling');
const { fileInfo, validateFile, convertPowerPoint, MAX_FILE } = require('./sharing');

async function fixture(t) {
  const app = express(), server = http.createServer(app), io = new Server(server);
  const revoked = new Set();
  const calls = new CallSignaling({ env: {}, requireJoinedRoom(socket, roomId) {
    if (revoked.has(socket.id) || roomId !== socket.data.roomId) throw new Error('no access');
    return { id: socket.id, userId: socket.id, name: socket.id };
  } });
  io.on('connection', socket => { socket.data.roomId = 'room'; socket.join('room'); calls.bind(socket, io); socket.on('disconnect', () => calls.leave(socket, io)); });
  calls.sharing.mount(app, io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`, clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await new Promise(resolve => io.close(resolve)); });
  async function connect(join = true) {
    const socket = client(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(socket); await new Promise(resolve => socket.once('connect', resolve));
    const request = (event, payload) => socket.timeout(3000).emitWithAck(event, { roomId: 'room', ...payload });
    const accepted = async (event, payload) => { const result = await request(event, payload); assert.equal(result.ok, true, result.error); return result.data; };
    const joined = join ? await accepted('call:join', { attemptId: `attempt-${socket.id}`, mode: 'audio', microphoneEnabled: true, cameraEnabled: false }) : null;
    return { socket, request, accepted, joined };
  }
  return { connect, calls, io, revoked, url };
}

test('whiteboard merges simultaneous authors, enforces ownership, clears stale strokes and transfers on departure', async t => {
  const f = await fixture(t), a = await f.connect(), b = await f.connect(), outsider = await f.connect(false);
  const callId = a.joined.call.id;
  const state = await a.accepted('share:start', { callId, kind: 'whiteboard' });
  const base = { callId, shareId: state.presentation.id, epoch: 0 };
  const item = (id, text) => ({ id, kind: 'text', color: '#334155', x: 20, y: 30, fontSize: 28, text, authorId: 'forged' });
  await Promise.all([a.accepted('share:board', { ...base, action: 'put', item: item('drawing-one', '你好') }), b.accepted('share:board', { ...base, action: 'put', item: item('drawing-two', 'hello') })]);
  let board = (await a.accepted('share:state', { callId })).presentation;
  assert.equal(board.items.length, 2); assert.deepEqual(new Set(board.items.map(item => item.authorId)), new Set([a.socket.id, b.socket.id]));
  assert.equal((await b.request('share:board', { ...base, action: 'put', item: item('drawing-one', 'hijack') })).ok, false);
  assert.equal((await outsider.request('share:state', { callId })).ok, false);
  const c = await f.connect(); assert.equal(c.joined.sharing.presentation.items.length, 2, 'late join receives complete state');
  await b.accepted('share:board', { ...base, action: 'undo' });
  board = (await a.accepted('share:state', { callId })).presentation; assert.deepEqual(board.items.map(item => item.id), ['drawing-one']);
  await b.accepted('share:board', { ...base, action: 'clear' });
  assert.equal((await a.request('share:board', { ...base, action: 'put', item: item('drawing-stale', 'old') })).ok, false);
  const oldId = a.socket.id;
  await a.accepted('call:leave', { attemptId: `attempt-${oldId}` });
  board = (await b.accepted('share:state', { callId })).presentation;
  assert.equal(board.ownerId, b.socket.id); assert.equal(board.epoch, 1); assert.deepEqual(board.items, []);
});

test('whiteboard validates bounded coordinates, text, total strokes and author-only undo', async t => {
  const f = await fixture(t), a = await f.connect(); const callId = a.joined.call.id;
  const state = await a.accepted('share:start', { callId, kind: 'whiteboard' });
  const base = { callId, shareId: state.presentation.id, epoch: 0, action: 'put' };
  const stroke = { id: 'stroke-valid', kind: 'stroke', color: '#123456', width: 4, points: [[10, 20], [30, 40]] };
  await a.accepted('share:board', { ...base, item: stroke });
  for (const patch of [{ color: 'red' }, { points: [[-1, 2]] }, { points: [[Infinity, 2]] }, { points: Array(513).fill([1, 2]) }, { kind: 'text', text: 'x'.repeat(201), x: 1, y: 2, fontSize: 28 }, { kind: 'text', text: 'text', x: 1, y: 2, fontSize: 120 }, { width: 999 }]) assert.equal((await a.request('share:board', { ...base, item: { ...stroke, ...patch } })).ok, false);
  assert.equal((await a.accepted('share:state', { callId })).presentation.items.length, 1);
});

test('private resource transfer permits current call members only and synchronizes presenter navigation', async t => {
  const f = await fixture(t), a = await f.connect(), b = await f.connect(); const callId = a.joined.call.id;
  const body = Buffer.from('# Shared document\nhello');
  const state = await a.accepted('share:start', { callId, kind: 'resource', file: { name: 'sample.md', size: body.length } });
  const base = { callId, shareId: state.presentation.id };
  const url = `${f.url}/api/call-share/${callId}/${base.shareId}`;
  const headers = { Authorization: `Bearer ${a.joined.shareToken}`, 'Content-Type': 'application/octet-stream' };
  assert.equal((await fetch(url, { method: 'POST', body, headers: { ...headers, Authorization: `Bearer ${b.joined.shareToken}` } })).status, 409);
  const upload = await fetch(url, { method: 'POST', body, headers }); assert.equal(upload.status, 200, await upload.text());
  assert.equal((await fetch(url)).status, 403);
  const download = await fetch(url, { headers: { Authorization: `Bearer ${b.joined.shareToken}` } });
  assert.equal(download.headers.get('cache-control'), 'no-store'); assert.equal(await download.text(), body.toString());
  assert.equal((await b.request('share:navigate', { ...base, page: 2, scroll: .7 })).ok, false);
  await a.accepted('share:navigate', { ...base, page: 2, scroll: .7 });
  const remote = (await b.accepted('share:state', { callId })).presentation; assert.equal(remote.page, 2); assert.equal(remote.scroll, .7);
  assert.equal((await a.request('share:navigate', { ...base, page: -1, scroll: 10 })).ok, false);
  f.revoked.add(b.socket.id); assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${b.joined.shareToken}` } })).status, 403);
  assert.equal(f.calls.sharing.bytes, body.length);
  await a.accepted('share:stop', base); assert.equal(f.calls.sharing.bytes, 0); assert.equal((await fetch(url, { headers })).status, 403);
});

test('ending a call removes shared resources and old access tokens cannot read a later call', async t => {
  const f = await fixture(t), a = await f.connect(); const callId = a.joined.call.id;
  const body = Buffer.from('log');
  const state = await a.accepted('share:start', { callId, kind: 'resource', file: { name: 'sample.log', size: body.length } });
  const url = `${f.url}/api/call-share/${callId}/${state.presentation.id}`, headers = { Authorization: `Bearer ${a.joined.shareToken}`, 'Content-Type': 'application/octet-stream' };
  assert.equal((await fetch(url, { method: 'POST', body, headers })).status, 200);
  await a.accepted('call:leave', { attemptId: `attempt-${a.socket.id}` });
  assert.equal(f.calls.sharing.bytes, 0); assert.equal((await fetch(url, { headers })).status, 403);
});

test('invalid uploads free reservations and clear presentation so another share can start', async t => {
  const f = await fixture(t), a = await f.connect(); const callId = a.joined.call.id;
  const state = await a.accepted('share:start', { callId, kind: 'resource', file: { name: 'bad.pdf', size: 5 } });
  const response = await fetch(`${f.url}/api/call-share/${callId}/${state.presentation.id}`, { method: 'POST', headers: { Authorization: `Bearer ${a.joined.shareToken}`, 'Content-Type': 'application/octet-stream' }, body: 'wrong' });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /不匹配/);
  assert.equal(f.calls.sharing.bytes, 0); assert.equal((await a.accepted('share:state', { callId })).presentation, null);
  await a.accepted('share:start', { callId, kind: 'screen' });
  assert.equal((await a.request('share:start', { callId, kind: 'whiteboard' })).ok, false, 'one active presentation at a time');
});

test('resource whitelist, size and signature checks reject disguised active files', () => {
  for (const file of [{ name: 'script.svg', size: 10 }, { name: 'large.pdf', size: MAX_FILE + 1 }, { name: 'large.md', size: 2 * 1024 * 1024 + 1 }, { name: 'empty.log', size: 0 }]) assert.throws(() => fileInfo(file));
  assert.throws(() => validateFile(Buffer.from('<script>'), fileInfo({ name: 'x.png', size: 8 })));
  const file = fileInfo({ name: 'safe.html', size: 8 }); validateFile(Buffer.from('<script>'), file); // Rendered only through the static sanitizer.
});

test('missing PowerPoint converter reports a useful fallback without starting an unusable share', async t => {
  const f = await fixture(t), a = await f.connect();
  f.calls.sharing.office = '';
  const callId = a.joined.call.id;
  const result = await a.request('share:start', { callId, kind: 'resource', file: { name: 'deck.pptx', size: 123 } });
  assert.equal(result.ok, false); assert.match(result.error, /PDF/);
  assert.equal((await a.accepted('share:state', { callId })).presentation, null);
});

test('PowerPoint conversion uses isolated profiles, bounded execution and removes temporary files on success or failure', async () => {
  let directory;
  const output = await convertPowerPoint(Buffer.from('slides'), 'pptx', '/test/office', async (binary, args, options) => {
    assert.equal(binary, '/test/office'); assert.ok(args.includes('--headless')); assert.ok(args.includes('pdf:impress_pdf_Export'));
    assert.equal(options.timeout, 60000); assert.equal(options.windowsHide, true);
    directory = args[args.indexOf('--outdir') + 1];
    assert.equal((await fs.readFile(path.join(directory, 'slides.pptx'))).toString(), 'slides');
    const profile = await fs.readFile(path.join(directory, 'profile/user/registrymodifications.xcu'), 'utf8');
    assert.match(profile, /MacroSecurityLevel/); assert.match(profile, /<value>3<\/value>/);
    await fs.writeFile(path.join(directory, 'slides.pdf'), '%PDF-test');
  });
  assert.equal(output.toString(), '%PDF-test'); await assert.rejects(fs.access(directory));
  await assert.rejects(convertPowerPoint(Buffer.from('slides'), 'ppt', '/test/office', async (_binary, args) => {
    directory = args[args.indexOf('--outdir') + 1]; throw new Error('conversion timeout');
  }), /timeout/);
  await assert.rejects(fs.access(directory));
});
