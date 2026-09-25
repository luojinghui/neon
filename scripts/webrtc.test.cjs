const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

class Track {
  constructor(kind) { this.kind = kind; this.readyState = 'live'; }
  stop() { this.readyState = 'ended'; }
}
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter((entry) => entry !== track); }
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function load(name, dependencies, globals) {
  const filename = path.join(__dirname, '../src/modules/webrtc', `${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: (id) => id === '../video-effects/types' ? effectTypes : dependencies[id], Error, setTimeout, clearTimeout, console, crypto: webcrypto, MediaStream: Stream, ...globals }, { filename });
  return module.exports;
}
const effectTypes = load('../video-effects/types', {});

function fixture(acquire) {
  const captures = [], tracks = [], messages = [], peers = [];
  const media = load('media', {}, {
    window: { isSecureContext: true }, RTCPeerConnection: class {},
    navigator: { mediaDevices: { getUserMedia: async (constraints) => {
      captures.push(constraints);
      if (acquire) return acquire(constraints);
      const track = new Track(constraints.video ? 'video' : 'audio'); tracks.push(track); return new Stream([track]);
    } } }
  });
  class Peer {
    constructor(options) { this.options = options; this.replacements = []; peers.push(this); }
    replace(kind, track) { this.replacements.push({ kind, track }); return Promise.resolve(); }
    receive() { return Promise.resolve(); }
    close() { this.closed = true; }
  }
  let revision = 1;
  let onState;
  let joinRequest;
  const result = () => ({ roomId: 'room', revision: revision++, selfId: 'self', configuration: {}, call: { id: 'call', roomId: 'room', mode: 'audio', startedAt: 1, maxParticipants: 4, participants: [{ peerId: 'self', name: '我', microphoneEnabled: true, cameraEnabled: false }, { peerId: 'remote', name: '伙伴', microphoneEnabled: true, cameraEnabled: false }] } });
  const transport = {
    onState(listener) { onState = listener; return () => { onState = null; }; },
    onSignal() { return () => undefined; },
    async request(event, payload) {
      messages.push({ event, payload });
      if (event === 'call:state') return { roomId: 'room', revision: 0, call: null };
      if (event === 'call:join') return joinRequest ? joinRequest.promise : result();
      return null;
    }
  };
  const { CallSession } = load('session', { './media': media, './peer': { CallPeer: Peer } });
  const session = new CallSession('room', transport);
  return { session, media, captures, tracks, messages, peers, result, emit: (state) => onState?.(state), delayJoin: () => { joinRequest = deferred(); return joinRequest; } };
}

test('entering a room does not capture devices; voice captures audio only and camera toggles stop/reacquire', async () => {
  const f = fixture();
  await f.session.connect();
  assert.equal(f.captures.length, 0);
  await f.session.join('audio');
  assert.equal(f.session.getSnapshot().phase, 'active');
  assert.equal(f.captures.length, 1);
  assert.equal(f.captures[0].video, false);
  await f.session.toggleDevice('video');
  const camera = f.tracks.find((track) => track.kind === 'video');
  assert.equal(f.captures[1].audio, false);
  assert.equal(f.session.getSnapshot().cameraEnabled, true);
  assert.equal(f.peers[0].replacements[0].track, camera);
  await f.session.toggleDevice('video');
  assert.equal(camera.readyState, 'ended');
  assert.equal(f.session.getSnapshot().localStream.getVideoTracks().length, 0);
  assert.equal(f.tracks[0].readyState, 'live', 'turning off camera preserves audio');
  await f.session.toggleDevice('audio');
  assert.equal(f.tracks[0].readyState, 'ended');
  await f.session.toggleDevice('audio');
  assert.equal(f.captures.at(-1).video, false);
  f.session.dispose();
  assert.ok(f.tracks.every((track) => track.readyState === 'ended'));
  assert.equal(f.peers[0].closed, true);
});

test('hangup removes self before server acknowledgement and ignores queued self announcements', async () => {
  const f = fixture();
  await f.session.connect();
  await f.session.join('audio');
  const original = f.session.getSnapshot().call;
  f.emit({ roomId: 'room', revision: 5, call: { ...original, participants: original.participants.filter(member => member.peerId === 'self') } });
  const states = [];
  f.session.subscribe(() => states.push(f.session.getSnapshot()));
  f.session.hangup();
  assert.equal(f.session.getSnapshot().call, null, 'no transient join notice above the composer');
  f.emit({ roomId: 'room', revision: 6, call: { ...original, participants: original.participants.filter(member => member.peerId === 'self') } });
  assert.ok(states.every(state => state.phase === 'idle' && state.call === null));
  const ack = f.delayJoin();
  const rejoining = f.session.join('audio');
  await flush();
  ack.resolve({ ...f.result(), revision: 7 });
  await rejoining;
  assert.equal(f.session.getSnapshot().phase, 'active', 'can immediately rejoin');
  f.session.hangup();
  assert.deepEqual(Array.from(f.session.getSnapshot().call.participants, member => member.peerId), ['remote'], 'other participants remain joinable');
  f.session.dispose();
});

test('cancel during browser permission prompt stops late media and never joins', async () => {
  const permission = deferred();
  const f = fixture(() => permission.promise);
  const joining = f.session.join('video');
  f.session.hangup();
  const lateTrack = new Track('audio'); permission.resolve(new Stream([lateTrack]));
  await joining;
  assert.equal(lateTrack.readyState, 'ended');
  assert.equal(f.session.getSnapshot().phase, 'idle');
  assert.equal(f.messages.some((message) => message.event === 'call:join'), false);
  assert.equal(f.captures.length, 1, 'cancelled audio permission cannot open camera');
  f.session.dispose();
});

test('late join acknowledgement leaves only its cancelled attempt and does not resurrect capture', async () => {
  const f = fixture(); const pending = f.delayJoin();
  const joining = f.session.join('audio'); await flush();
  const attemptId = f.messages.find((message) => message.event === 'call:join').payload.attemptId;
  f.session.hangup();
  pending.resolve(f.result()); await joining;
  assert.equal(f.session.getSnapshot().phase, 'idle');
  assert.ok(f.tracks.every((track) => track.readyState === 'ended'));
  assert.ok(f.messages.filter((message) => message.event === 'call:leave').every((message) => message.payload.attemptId === attemptId));
  f.session.dispose();
});

test('camera denial cleans microphone and never creates a server call', async () => {
  const microphone = new Track('audio');
  const f = fixture((constraints) => constraints.video ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) : Promise.resolve(new Stream([microphone])));
  await f.session.join('video');
  assert.equal(microphone.readyState, 'ended');
  assert.equal(f.session.getSnapshot().phase, 'idle');
  assert.match(f.session.getSnapshot().error, /权限/);
  assert.equal(f.messages.some((message) => message.event === 'call:join'), false);
  f.session.dispose();
});

test('end/revocation releases media, stale room snapshots cannot restore calls, and disposal ignores late events', async () => {
  const f = fixture(); await f.session.connect(); await f.session.join('video');
  f.emit({ roomId: 'room', revision: 10, call: null, reason: 'access-revoked' });
  assert.equal(f.session.getSnapshot().phase, 'idle');
  assert.ok(f.tracks.every((track) => track.readyState === 'ended'));
  f.emit(f.result());
  assert.equal(f.session.getSnapshot().call, null);
  f.session.dispose(); f.emit(f.result());
  assert.equal(f.session.getSnapshot().phase, 'idle');
});

test('hangup while camera permission is pending releases late camera without touching a new session', async () => {
  const permission = deferred();
  const microphone = new Track('audio'); const camera = new Track('video');
  const f = fixture((constraints) => constraints.video ? permission.promise : Promise.resolve(new Stream([microphone])));
  await f.session.join('audio');
  const enabling = f.session.toggleDevice('video');
  f.session.hangup(); permission.resolve(new Stream([camera])); await enabling;
  assert.equal(camera.readyState, 'ended'); assert.equal(microphone.readyState, 'ended');
  assert.equal(f.session.getSnapshot().cameraEnabled, false);
  f.session.dispose();
});

test('perfect negotiation buffers ICE, resolves colliding offers and closes all resources', async () => {
  const connections = [], sent = [], errors = [];
  class Connection {
    constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.candidates = []; connections.push(this); }
    addTransceiver() { return { sender: { replaceTrack: async () => undefined } }; }
    async setLocalDescription() { this.localDescription = { type: this.signalingState === 'have-remote-offer' ? 'answer' : 'offer', toJSON() { return { type: this.type, sdp: 'v=0' }; } }; this.signalingState = this.localDescription.type === 'answer' ? 'stable' : 'have-local-offer'; }
    async setRemoteDescription(description) { this.remoteDescription = description; this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'; }
    async addIceCandidate(candidate) { this.candidates.push(candidate); }
    close() { this.closed = true; }
    restartIce() {}
  }
  const { CallPeer } = load('peer', {}, { RTCPeerConnection: Connection });
  const options = { configuration: {}, localStream: new Stream(), polite: true, send: async (signal) => sent.push(signal), onChange() {}, onError: (error) => errors.push(error) };
  const peer = new CallPeer(options), pc = connections[0];
  await peer.receive({ candidate: { candidate: 'early' } }); assert.equal(pc.candidates.length, 0);
  await pc.onnegotiationneeded();
  assert.equal(pc.localDescription, undefined, 'only the elected initial offerer negotiates');
  pc.remoteDescription = { type: 'answer', sdp: 'v=0' };
  await pc.onnegotiationneeded();
  await peer.receive({ description: { type: 'offer', sdp: 'collision' } });
  assert.equal(pc.candidates.length, 1); assert.equal(sent.at(-1).description.type, 'answer');
  peer.close(); assert.equal(pc.closed, true); assert.equal(pc.onicecandidate, null);
  const impolite = new CallPeer({ ...options, polite: false }), second = connections[1];
  await second.onnegotiationneeded();
  await impolite.receive({ description: { type: 'offer', sdp: 'ignore' } });
  await impolite.receive({ candidate: { candidate: 'ignored-offer-candidate' } });
  assert.equal(second.remoteDescription, undefined); assert.equal(second.candidates.length, 0);
  await impolite.receive({ description: { type: 'answer', sdp: 'v=0' } });
  assert.equal(second.candidates[0].candidate, 'ignored-offer-candidate', 'rollback may reuse candidates for the subsequent answer');
  impolite.close(); assert.equal(errors.length, 0);
});

test('effects settings reject unknown assets and clamp device work; default settings require no processor', () => {
  const { normalizeVideoEffects, effectsEnabled, DEFAULT_VIDEO_EFFECTS } = effectTypes;
  assert.equal(effectsEnabled(DEFAULT_VIDEO_EFFECTS), false);
  const value = normalizeVideoEffects({ whitening: Infinity, smoothing: 300, sticker2d: '../../secret', color: 'red', background: 'https://elsewhere', accessory: 'unknown' });
  assert.equal(value.whitening, 0); assert.equal(value.smoothing, 100);
  assert.equal(value.sticker2d, 'none'); assert.equal(value.background, 'original'); assert.equal(value.accessory, undefined);
});

test('effects never open a camera, replace only the outgoing video, and reset preserves raw capture', async () => {
  const f = fixture(); const outputs = [], processors = [];
  const media = new f.media.LocalMedia(async (source) => {
    const track = new Track('video');
    const processor = { source, track, configure(settings) { this.settings = settings; }, async start() { return track; }, dispose() { track.stop(); this.disposed = true; } };
    processors.push(processor); return processor;
  });
  media.onVideoOutput = track => outputs.push(track);
  media.setEffects({ ...effectTypes.DEFAULT_VIDEO_EFFECTS, sticker2d: 'hearts' });
  await flush(); assert.equal(f.captures.length, 0); assert.equal(processors.length, 0);
  await media.enable('audio'); await media.enable('video'); await flush();
  assert.equal(processors.length, 1);
  assert.equal(media.stream.getVideoTracks()[0], processors[0].track);
  assert.equal(f.tracks[1].readyState, 'live', 'raw camera remains owned while processing');
  media.setEffects({ ...effectTypes.DEFAULT_VIDEO_EFFECTS, faceEffect: 'cat' }); await flush();
  assert.equal(processors.length, 1, 'settings changes reuse the processor');
  assert.equal(processors[0].settings.faceEffect, 'cat');
  media.setEffects(effectTypes.DEFAULT_VIDEO_EFFECTS); await flush();
  assert.equal(processors[0].disposed, true); assert.equal(media.stream.getVideoTracks()[0], f.tracks[1]);
  assert.equal(f.captures.length, 2, 'effects never call getUserMedia');
  media.dispose(); assert.ok(f.tracks.every(track => track.readyState === 'ended'));
});

test('closing the camera while models start releases raw and late processed tracks, without touching audio', async () => {
  const f = fixture(); const pending = deferred(), processed = new Track('video'); let disposed = 0;
  const media = new f.media.LocalMedia(async () => ({ configure() {}, start: () => pending.promise, dispose() { disposed++; processed.stop(); } }));
  await media.enable('audio'); await media.enable('video');
  media.setEffects({ ...effectTypes.DEFAULT_VIDEO_EFFECTS, background: 'sunroom' }); await flush();
  media.disable('video'); pending.resolve(processed); await flush();
  assert.ok(disposed > 0); assert.equal(processed.readyState, 'ended'); assert.equal(f.tracks[1].readyState, 'ended');
  assert.equal(f.tracks[0].readyState, 'live'); assert.equal(media.stream.getVideoTracks().length, 0);
  media.dispose();
});

test('initialization/runtime failures restore raw video and allow retry without re-acquiring a camera', async () => {
  const f = fixture(); let fail, attempts = 0; const statuses = [];
  const media = new f.media.LocalMedia(async (_source, _status, failed) => {
    if (++attempts === 1) throw new Error('model unavailable');
    fail = failed; const track = new Track('video');
    return { configure() {}, async start() { return track; }, dispose() { track.stop(); } };
  });
  media.onEffectsStatus = status => statuses.push(status);
  await media.enable('video');
  const settings = { ...effectTypes.DEFAULT_VIDEO_EFFECTS, whitening: 20 };
  media.setEffects(settings); await flush();
  assert.equal(statuses.at(-1).phase, 'error'); assert.equal(media.stream.getVideoTracks()[0], f.tracks[0]);
  media.setEffects(settings); await flush(); assert.notEqual(media.stream.getVideoTracks()[0], f.tracks[0]);
  fail(new Error('GPU context lost')); assert.equal(media.stream.getVideoTracks()[0], f.tracks[0]);
  assert.equal(f.captures.length, 1); media.dispose();
});
