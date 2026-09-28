const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const express = require('express');
const { createCloudNetworkApp } = require('../src/server/controller/cloudNetworkController');

function load(globals = {}) {
  const file = path.join(__dirname, '../src/app/cloud/networkDiagnostics.ts');
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: createRequire(file), URL, AbortController, DOMException, setTimeout, clearTimeout, ...globals });
  return exports;
}

function rtc({ fail = false } = {}) {
  const instances = [];
  class Peer {
    constructor(configuration) { this.configuration = configuration; this.iceGatheringState = 'new'; instances.push(this); }
    createDataChannel() { this.channel = { close: () => { this.channelClosed = true; } }; return this.channel; }
    async createOffer() { if (fail) throw Error('RTC unavailable'); return {}; }
    async setLocalDescription() { this.started = true; }
    close() { this.closed = true; }
    emit(address, type = 'host', protocol = 'udp', port = 1234) {
      this.onicecandidate?.({ candidate: { address, type, protocol, port, candidate: `candidate:1 1 ${protocol} 123 ${address} ${port} typ ${type}` } });
    }
    complete() { this.iceGatheringState = 'complete'; this.onicegatheringstatechange?.(); }
  }
  return { RTCPeerConnection: Peer, instances };
}

test('address classification separates private IPv4/IPv6, link-local, loopback and mDNS', () => {
  const { classifyAddress } = load();
  for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.2', 'fd12::1', 'fc00::1', '::ffff:192.168.1.2']) assert.equal(classifyAddress(address), 'private', address);
  for (const address of ['169.254.1.2', 'fe80::1234']) assert.equal(classifyAddress(address), 'link-local', address);
  for (const address of ['127.0.0.1', '::1', '0:0:0:0:0:0:0:1']) assert.equal(classifyAddress(address), 'loopback', address);
  assert.equal(classifyAddress('abc.LOCAL'), 'mdns');
  for (const address of ['999.1.1.1', '100.64.1.2', '0.0.0.0', '::', 'invalid']) assert.equal(classifyAddress(address), 'unknown', address);
});

test('ICE preserves separate sources and raw candidates without treating mDNS or srflx as local IP', async () => {
  const fake = rtc(), { collectIce } = load(fake);
  const promise = collectIce(new AbortController().signal);
  const peer = fake.instances[0];
  peer.emit('192.168.1.20'); peer.emit('192.168.1.20'); peer.emit('masked.local'); peer.emit('fd00::1');
  peer.emit('198.51.100.3', 'srflx');
  peer.complete();
  const result = await promise;
  assert.equal(result.status, 'complete');
  assert.equal(result.stunServer, 'stun:8.137.55.241:3478');
  assert.deepEqual(Array.from(result.localIps), ['192.168.1.20', 'fd00::1']);
  assert.deepEqual(Array.from(result.mappedIps), ['198.51.100.3']);
  assert.deepEqual(Array.from(result.mdnsNames), ['masked.local']);
  assert.equal(result.candidates.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(peer.configuration)), {
    iceServers: [{ urls: 'stun:8.137.55.241:3478' }],
    iceTransportPolicy: 'all'
  });
  assert.ok(peer.closed && peer.channelClosed);
  assert.equal(peer.onicecandidate, null);
});

test('STUN mappings deduplicate IPs across ports and protocols while preserving candidate details', async () => {
  const fake = rtc(), { collectIce } = load(fake);
  const promise = collectIce(new AbortController().signal);
  const peer = fake.instances[0];
  peer.emit('198.51.100.7', 'srflx', 'udp', 1234);
  peer.emit('198.51.100.7', 'srflx', 'udp', 5678);
  peer.emit('198.51.100.7', 'srflx', 'tcp', 5678);
  peer.emit('2001:db8::7', 'srflx');
  peer.emit('192.168.200.1', 'srflx');
  peer.emit('masked.local', 'srflx');
  peer.emit('999.1.1.1', 'srflx');
  peer.emit('203.0.113.7', 'host');
  peer.emit('203.0.113.8', 'relay');
  peer.complete();
  const result = await promise;
  assert.deepEqual(Array.from(result.mappedIps), ['198.51.100.7', '2001:db8::7', '192.168.200.1']);
  assert.deepEqual(Array.from(result.localIps), []);
  assert.equal(result.candidates.filter(candidate => candidate.address === '198.51.100.7').length, 3);
  assert.equal(result.candidates.length, 9);
});

test('older candidate shape falls back to SDP without dropping the source', () => {
  const { readIceAddress } = load();
  const result = readIceAddress({ candidate: 'candidate:9 1 udp 123 192.168.4.5 12345 typ host' });
  assert.equal(result.address, '192.168.4.5'); assert.equal(result.type, 'host'); assert.equal(result.port, 12345);
  assert.equal(readIceAddress({ candidate: '' }), null);
});

test('ICE timeout retains partial results and closes the peer', async () => {
  const fake = rtc(), { collectIce } = load(fake);
  const promise = collectIce(new AbortController().signal, 10);
  fake.instances[0].emit('partial.local');
  fake.instances[0].emit('198.51.100.5', 'srflx');
  const result = await promise;
  assert.equal(result.status, 'timeout'); assert.equal(result.candidates.length, 2);
  assert.deepEqual(Array.from(result.mappedIps), ['198.51.100.5']);
  assert.ok(fake.instances[0].closed);
});

test('navigation cancellation cleans up ICE and prevents late setup', async () => {
  const fake = rtc(), { collectIce } = load(fake), controller = new AbortController();
  const promise = collectIce(controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.ok(fake.instances[0].closed && fake.instances[0].channelClosed);
  assert.equal(fake.instances[0].started, undefined);
});

test('unsupported and failed WebRTC terminate without leaving peers open', async () => {
  assert.equal((await load().collectIce(new AbortController().signal)).status, 'unsupported');
  const fake = rtc({ fail: true });
  const result = await load(fake).collectIce(new AbortController().signal);
  assert.equal(result.status, 'error'); assert.match(result.errors[0], /RTC unavailable/);
  assert.ok(fake.instances[0].closed);
});

const requestData = { requestIp: '127.0.0.1', requestIpSource: 'socket', socketIp: '127.0.0.1', socketAddress: '127.0.0.1', proxyTrusted: false, headers: { xForwardedFor: '', xRealIp: '', forwarded: '' }, observedAt: new Date().toISOString() };

test('combined report waits for both sources before publishing', async () => {
  const fake = rtc(); let releaseRequest;
  const fetch = () => new Promise(resolve => { releaseRequest = () => resolve({ ok: true, json: async () => requestData }); });
  const { collectNetworkDiagnostics } = load({ ...fake, fetch });
  let settled = false;
  const promise = collectNetworkDiagnostics(new AbortController().signal).then(result => { settled = true; return result; });
  fake.instances[0].complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  releaseRequest();
  const result = await promise;
  assert.equal(result.ice.status, 'complete'); assert.equal(result.request.status, 'complete');
});

test('HTTP failure does not discard ICE results', async () => {
  const fake = rtc();
  const { collectNetworkDiagnostics } = load({ ...fake, fetch: async () => ({ ok: false, status: 503 }) });
  const promise = collectNetworkDiagnostics(new AbortController().signal);
  fake.instances[0].emit('192.168.1.2'); fake.instances[0].complete();
  const result = await promise;
  assert.equal(result.ice.localIps[0], '192.168.1.2'); assert.equal(result.request.status, 'error');
  assert.match(result.request.error, /503/);
});

test('HTTP timeout aborts the request and reports timeout rather than completion', async () => {
  let aborted = false;
  const fetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('cancelled', 'AbortError')); }));
  const result = await load({ fetch }).collectRequestSource(new AbortController().signal, 10);
  assert.equal(result.status, 'timeout'); assert.ok(aborted);
});

async function withServer(env, run) {
  const app = express();
  app.use('/api/cloud/network-info', createCloudNetworkApp(env));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/cloud/network-info`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('source API ignores spoofed proxy headers by default and disables caching', async () => {
  await withServer({}, async url => {
    const response = await fetch(url, { headers: { 'x-forwarded-for': '198.51.100.99', 'x-real-ip': '10.0.0.8', forwarded: 'for=192.168.1.1' } });
    const data = await response.json();
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(data.requestIp, '127.0.0.1'); assert.equal(data.requestIpSource, 'socket'); assert.equal(data.proxyTrusted, false);
    assert.equal(data.headers.xForwardedFor, '198.51.100.99'); assert.equal(data.headers.xRealIp, '10.0.0.8');
  });
});

test('source API stops at the first untrusted proxy instead of accepting the leftmost address', async () => {
  await withServer({ CLOUD_TRUSTED_PROXIES: 'loopback' }, async url => {
    const data = await (await fetch(url, { headers: { 'x-forwarded-for': '10.9.9.9, 198.51.100.20' } })).json();
    assert.equal(data.requestIp, '198.51.100.20'); assert.equal(data.requestIpSource, 'x-forwarded-for'); assert.equal(data.proxyTrusted, true);
    const invalid = await (await fetch(url, { headers: { 'x-forwarded-for': 'not-an-ip' } })).json();
    assert.equal(invalid.requestIp, '127.0.0.1'); assert.equal(invalid.requestIpSource, 'socket');
    const ipv6 = await (await fetch(url, { headers: { 'x-forwarded-for': '::ffff:192.168.1.3' } })).json();
    assert.equal(ipv6.requestIp, '192.168.1.3');
  });
});
