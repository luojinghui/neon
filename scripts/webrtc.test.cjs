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
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function loadFile(filename, dependencies = {}, globals = {}) {
  const resolved = path.resolve(filename);
  const { outputText } = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const module = { exports: {} };
  const localRequire = (id) => {
    if (dependencies && Object.prototype.hasOwnProperty.call(dependencies, id)) return dependencies[id];
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(resolved), id);
      return loadFile(fs.existsSync(`${base}.ts`) ? `${base}.ts` : base, {}, globals);
    }
    return require(id);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: localRequire, Error, setTimeout, clearTimeout, console, crypto: webcrypto, MediaStream: Stream, ...globals }, { filename: resolved });
  return module.exports;
}
function load(name, dependencies, globals) {
  return loadFile(path.join(__dirname, '../src/modules/webrtc', `${name}.ts`), dependencies, globals);
}
const effectTypes = load('../virtual-background/settings', {});

function fixture(acquire, acquireDisplay, storage) {
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
  let onSharing, shareRevision = 0;
  let presentation = null;
  const result = () => ({ roomId: 'room', revision: revision++, selfId: 'self', configuration: {}, call: { id: 'call', roomId: 'room', mode: 'audio', startedAt: 1, maxParticipants: 4, participants: [{ peerId: 'self', name: '我', microphoneEnabled: true, cameraEnabled: false }, { peerId: 'remote', name: '伙伴', microphoneEnabled: true, cameraEnabled: false }] } });
  const transport = {
    onSharing(listener) { onSharing = listener; return () => { onSharing = null; }; },
    onState(listener) { onState = listener; return () => { onState = null; }; },
    onSignal() { return () => undefined; },
    async request(event, payload) {
      messages.push({ event, payload });
      if (event === 'call:state') return { roomId: 'room', revision: 0, call: null };
      if (event === 'call:join') return joinRequest ? joinRequest.promise : result();
      if (event === 'share:start') presentation = { id: 'presentation-one', kind: payload.kind, ownerId: 'self', page: 1, scroll: 0, epoch: 0, items: [] };
      if (event === 'share:stop') presentation = null;
      if (event.startsWith('share:')) return { roomId: 'room', callId: 'call', revision: ++shareRevision, presentation };
      return null;
    }
  };
  const displays = [];
  const { CallSession } = load('session', { './media': media, './peer': { CallPeer: Peer }, './sharing': load('sharing', {}), './devicePreferences': load('devicePreferences', {}, { localStorage: storage }) }, { DOMException, navigator: { mediaDevices: { getDisplayMedia: async () => {
    if (acquireDisplay) return acquireDisplay();
    const stream = new Stream([new Track('video')]); displays.push(stream); return stream;
  } } } });
  const session = new CallSession('room', transport);
  return { session, media, captures, tracks, displays, messages, peers, result, share: state => onSharing?.(state), emit: (state) => onState?.(state), delayJoin: () => { joinRequest = deferred(); return joinRequest; } };
}

function preferenceStorage(value) {
  const data = new Map(value === undefined ? [] : [['soul-call-device-preferences-v1', value]]);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, item) => data.set(key, item) };
}

test('device preferences validate saved values and voice never turns on a remembered camera', () => {
  const preferences = load('devicePreferences', {});
  const storage = preferenceStorage('{"microphoneEnabled":false,"cameraEnabled":true}');
  assert.deepEqual({ ...preferences.preferredCallDevices('audio', storage) }, { microphoneEnabled: false, cameraEnabled: false });
  assert.deepEqual({ ...preferences.preferredCallDevices('video', storage) }, { microphoneEnabled: false, cameraEnabled: true });
  for (const value of ['not-json', 'null', '[]', '{"microphoneEnabled":"false","cameraEnabled":0}']) {
    storage.setItem(preferences.CALL_DEVICE_PREFERENCES_KEY, value);
    assert.deepEqual({ ...preferences.preferredCallDevices('video', storage) }, { microphoneEnabled: true, cameraEnabled: true });
  }
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(preferences.preferredCallDevices('audio', unavailable).microphoneEnabled, true);
  assert.doesNotThrow(() => preferences.rememberCallDevice('audio', false, unavailable));
});

test('closing both devices survives hangup and a new session without acquiring hardware', async () => {
  const storage = preferenceStorage();
  const first = fixture(undefined, undefined, storage);
  await first.session.join('video');
  await first.session.toggleDevice('audio'); await first.session.toggleDevice('video');
  first.session.hangup(); first.session.dispose();
  const next = fixture(undefined, undefined, storage);
  await next.session.join('video');
  assert.equal(next.session.getSnapshot().phase, 'active');
  assert.equal(next.captures.length, 0, 'remembered closed devices never call getUserMedia');
  const joined = next.messages.find(message => message.event === 'call:join').payload;
  assert.equal(joined.microphoneEnabled, false); assert.equal(joined.cameraEnabled, false);
  assert.equal(next.peers.length, 1, 'receive-only participants still connect');
  await next.session.toggleDevice('audio'); await next.session.toggleDevice('video');
  next.session.dispose();
  const restored = fixture(undefined, undefined, storage);
  await restored.session.join('video');
  assert.equal(restored.captures.length, 2, 'successfully reopened devices are remembered');
  restored.session.dispose();
  const voice = fixture(undefined, undefined, storage); await voice.session.join('audio');
  assert.equal(voice.captures.length, 1); assert.equal(voice.captures[0].video, false);
  voice.session.dispose();
  assert.equal(JSON.parse(storage.getItem('soul-call-device-preferences-v1')).cameraEnabled, true, 'voice mode does not overwrite video preference');
});

test('permission denial and ended tracks do not overwrite deliberate device preferences', async () => {
  const storage = preferenceStorage('{"microphoneEnabled":false,"cameraEnabled":false}');
  const denied = fixture(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })), undefined, storage);
  await denied.session.join('video'); await denied.session.toggleDevice('audio');
  assert.equal(JSON.parse(storage.getItem('soul-call-device-preferences-v1')).microphoneEnabled, false);
  denied.session.dispose();
  const defaults = preferenceStorage();
  const call = fixture(undefined, undefined, defaults); await call.session.join('video');
  call.tracks.find(track => track.kind === 'audio').onended();
  call.tracks.find(track => track.kind === 'video').onended();
  call.session.dispose();
  assert.equal(defaults.data.size, 0, 'hardware endings and hangup are not persisted as user mute choices');
});

test('screen uses an independent sender; browser stop preserves microphone and camera', async () => {
  const f = fixture(); await f.session.connect(); await f.session.join('video');
  await f.session.startScreen();
  const track = f.displays[0].getVideoTracks()[0];
  assert.equal(f.session.getSnapshot().presentation.kind, 'screen');
  assert.equal(f.peers[0].replacements.at(-1).kind, 'screen');
  assert.equal(f.peers[0].replacements.at(-1).track, track);
  track.onended(); await flush();
  assert.equal(track.readyState, 'ended'); assert.equal(f.session.getSnapshot().presentation, null);
  assert.ok(f.tracks.every(track => track.readyState === 'live'), 'camera and mic remain live');
  await f.session.startScreen(); f.session.hangup();
  assert.ok(f.displays.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
  f.session.dispose();
});

test('screen permission returned after hangup cannot publish or leak capture', async () => {
  const permission = deferred(), f = fixture(undefined, () => permission.promise);
  await f.session.join('audio'); const pending = f.session.startScreen();
  f.session.hangup(); const track = new Track('video'); permission.resolve(new Stream([track])); await pending;
  assert.equal(track.readyState, 'ended'); assert.equal(f.session.getSnapshot().presentation, null);
  assert.equal(f.messages.some(message => message.event === 'share:start'), false);
  f.session.dispose();
});

test('screen permission denial is quiet and leaves the ongoing call intact', async () => {
  const f = fixture(undefined, () => Promise.reject(new DOMException('denied', 'NotAllowedError')));
  await f.session.join('audio'); await f.session.startScreen();
  assert.equal(f.session.getSnapshot().phase, 'active'); assert.equal(f.session.getSnapshot().error, '');
  assert.equal(f.session.getSnapshot().shareBusy, false); f.session.dispose();
});

test('cancelling a screen switch preserves the current presentation and capture', async () => {
  const original = new Track('video'); let request = 0;
  const f = fixture(undefined, () => ++request === 1 ? Promise.resolve(new Stream([original])) : Promise.reject(new DOMException('denied', 'NotAllowedError')));
  await f.session.join('audio'); await f.session.startScreen();
  await f.session.startScreen();
  assert.equal(original.readyState, 'live');
  assert.equal(f.session.getSnapshot().presentation.kind, 'screen');
  assert.equal(f.messages.filter(message => message.event === 'share:stop').length, 0);
  f.session.dispose();
});

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
  await peer.receive({ description: { type: 'offer', sdp: 'screen' }, screenStreamId: 'remote-screen-stream' });
  let view;
  options.onChange = value => { view = value; };
  const camera = new Track('video'), screen = new Track('video');
  pc.ontrack({ track: camera, streams: [{ id: 'remote-camera-stream' }] });
  pc.ontrack({ track: screen, streams: [{ id: 'remote-screen-stream' }] });
  assert.equal(view.stream.getVideoTracks()[0], camera);
  assert.equal(view.screenStream.getVideoTracks()[0], screen, 'offer-created receivers use the signaled stream ID');
  peer.close(); assert.equal(pc.closed, true); assert.equal(pc.onicecandidate, null);
  assert.equal(screen.readyState, 'ended');
  const impolite = new CallPeer({ ...options, polite: false }), second = connections[1];
  await second.onnegotiationneeded();
  await impolite.receive({ description: { type: 'offer', sdp: 'ignore' } });
  await impolite.receive({ candidate: { candidate: 'ignored-offer-candidate' } });
  assert.equal(second.remoteDescription, undefined); assert.equal(second.candidates.length, 0);
  await impolite.receive({ description: { type: 'answer', sdp: 'v=0' } });
  assert.equal(second.candidates[0].candidate, 'ignored-offer-candidate', 'rollback may reuse candidates for the subsequent answer');
  impolite.close(); assert.equal(errors.length, 0);
});

test('call video settings discard removed effects and clamp levels; defaults require no processor', () => {
  const { normalizeCallVideo, callVideoEnabled, DEFAULT_CALL_VIDEO } = effectTypes;
  assert.equal(callVideoEnabled(DEFAULT_CALL_VIDEO), false);
  const value = normalizeCallVideo({ whitening: Infinity, brightness: 300, smoothing: 40, sticker2d: '../../secret', background: 'https://elsewhere', avatar: { type: 'HEAD_VIRTUAL', url: 'https://elsewhere/face.png' }, sticker: { type: 'FACE_STICKY', id: 'ok', url: '/virtual/assets/head-01.png' } });
  assert.equal(value.whitening, 0); assert.equal(value.brightness, 100);
  assert.equal(value.smoothing, undefined); assert.equal(value.background.type, 'NONE'); assert.equal(value.avatar.type, 'NONE');
  assert.equal(value.sticker.url, '/virtual/assets/head-01.png');
  assert.deepEqual(Object.keys(value).sort(), ['avatar', 'background', 'brightness', 'sticker', 'whitening']);
});

test('effects never open a camera, replace only the outgoing video, and reset preserves raw capture', async () => {
  const f = fixture(); const outputs = [], processors = [];
  const media = new f.media.LocalMedia(async (source) => {
    const track = new Track('video');
    const processor = { source, track, configure(settings) { this.settings = settings; }, async start() { return track; }, dispose() { track.stop(); this.disposed = true; } };
    processors.push(processor); return processor;
  });
  media.onVideoOutput = track => outputs.push(track);
  media.setEffects({ ...effectTypes.DEFAULT_CALL_VIDEO, whitening: 35 });
  await flush(); assert.equal(f.captures.length, 0); assert.equal(processors.length, 0);
  await media.enable('audio'); await media.enable('video'); await flush();
  assert.equal(processors.length, 1);
  assert.equal(media.stream.getVideoTracks()[0], processors[0].track);
  assert.equal(f.tracks[1].readyState, 'live', 'raw camera remains owned while processing');
  media.setEffects({ ...effectTypes.DEFAULT_CALL_VIDEO, whitening: 25 }); await flush();
  assert.equal(processors.length, 1, 'settings changes reuse the processor');
  assert.equal(processors[0].settings.whitening, 25);
  media.setEffects(effectTypes.DEFAULT_CALL_VIDEO); await flush();
  assert.equal(processors[0].disposed, true); assert.equal(media.stream.getVideoTracks()[0], f.tracks[1]);
  assert.equal(f.captures.length, 2, 'effects never call getUserMedia');
  const videoCapture = f.captures.find((item) => item.video);
  assert.equal(videoCapture.video.width.ideal, 1280);
  assert.equal(videoCapture.video.height.ideal, 720);
  assert.equal(videoCapture.video.frameRate.max, 30);
  media.dispose(); assert.ok(f.tracks.every(track => track.readyState === 'ended'));
});

test('closing the camera while beauty rendering starts releases raw and late processed tracks, without touching audio', async () => {
  const f = fixture(); const pending = deferred(), processed = new Track('video'); let disposed = 0;
  const media = new f.media.LocalMedia(async () => ({ configure() {}, start: () => pending.promise, dispose() { disposed++; processed.stop(); } }));
  await media.enable('audio'); await media.enable('video');
  media.setEffects({ ...effectTypes.DEFAULT_CALL_VIDEO, whitening: 30 }); await flush();
  media.disable('video'); pending.resolve(processed); await flush();
  assert.ok(disposed > 0); assert.equal(processed.readyState, 'ended'); assert.equal(f.tracks[1].readyState, 'ended');
  assert.equal(f.tracks[0].readyState, 'live'); assert.equal(media.stream.getVideoTracks().length, 0);
  media.dispose();
});

test('initialization/runtime failures restore raw video and allow retry without re-acquiring a camera', async () => {
  const f = fixture(); let fail, attempts = 0; const statuses = [];
  const media = new f.media.LocalMedia(async (_source, _status, failed) => {
    if (++attempts === 1) throw new Error('renderer unavailable');
    fail = failed; const track = new Track('video');
    return { configure() {}, async start() { return track; }, dispose() { track.stop(); } };
  });
  media.onEffectsStatus = status => statuses.push(status);
  await media.enable('video');
  const settings = { ...effectTypes.DEFAULT_CALL_VIDEO, whitening: 20 };
  media.setEffects(settings); await flush();
  assert.equal(statuses.at(-1).phase, 'error'); assert.equal(media.stream.getVideoTracks()[0], f.tracks[0]);
  media.setEffects(settings); await flush(); assert.notEqual(media.stream.getVideoTracks()[0], f.tracks[0]);
  fail(new Error('GPU context lost')); assert.equal(media.stream.getVideoTracks()[0], f.tracks[0]);
  assert.equal(f.captures.length, 1); media.dispose();
});

test('one video sender simulcasts 180 and 360 from the 720p capture', async () => {
  const simulcast = loadFile(path.join(__dirname, '../src/modules/media-track/simulcast.ts'));
  assert.deepEqual(JSON.parse(JSON.stringify(simulcast.peopleSimulcastEncodings(1280, 720).map((item) => item.scaleResolutionDownBy))), [4, 2, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(simulcast.peopleSimulcastEncodings(1920, 1080).map((item) => [item.rid, item.scaleResolutionDownBy, item.maxFramerate]))), [['l', 6, 15], ['m', 3, 30], ['h', 1.5, 30]]);
  assert.equal(simulcast.scaleForTarget(640, 480, 720), 1);
  const pipelineModule = loadFile(path.join(__dirname, '../src/modules/media-track/pipeline.ts'));
  const order = [];
  const piped = await new pipelineModule.TrackPipeline()
    .connect({ async process(input) { order.push('first'); return { ...input, width: input.width / 2 }; } })
    .connect({ async process(input) { order.push(input.width); return input; } })
    .run({ track: {}, width: 1280, height: 720 });
  assert.deepEqual(order, ['first', 640]);
  assert.equal(piped.height, 720);
  const inits = [];
  let videoSender;
  class Connection {
    close() {}
    restartIce() {}
    addTransceiver(_track, init) {
      const encodings = (init?.sendEncodings || []).map((item) => ({ ...item }));
      const sender = { getParameters: () => ({ encodings }), async setParameters(params) { sender.applied = JSON.parse(JSON.stringify(params.encodings.map((item) => item.scaleResolutionDownBy))); }, async replaceTrack() {} };
      if (init?.sendEncodings) videoSender = sender;
      inits.push(init);
      return { sender };
    }
  }
  const { CallPeer } = load('peer', {}, { RTCPeerConnection: Connection });
  const peer = new CallPeer({ configuration: {}, localStream: new Stream(), polite: true, send: async () => {}, onChange() {}, onError() {} });
  try {
    assert.equal(inits.length, 3);
    assert.equal(inits[0].sendEncodings, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(inits[1].sendEncodings.map((item) => item.scaleResolutionDownBy))), [4, 2, 1]);
    assert.deepEqual(JSON.parse(JSON.stringify(inits[1].sendEncodings.map((item) => item.rid))), ['l', 'm', 'h']);
    assert.equal(inits[2].sendEncodings, undefined);
    await peer.updateVideoEncodings(1920, 1080);
    assert.deepEqual(JSON.parse(JSON.stringify(videoSender.applied)), [6, 3, 1.5]);
  } finally { peer.close(); }
  const extension = fs.readFileSync(path.join(__dirname, '../src/modules/virtual-background/plugin/core/extension.ts'), 'utf8');
  assert.equal(extension.includes('XYDetector'), false);
  assert.match(extension, /isSupportExtension\(\) \{\s*return true;/);
  for (const file of ['xylink_segmenter.tflite', 'xylink_face.tflite', 'xylink_face_landmarker.task', 'xylink_vision.js', 'xylink_vision.wasm']) {
    assert.equal(fs.existsSync(path.join(__dirname, '../public/virtual/model/v1.0.1', file)), true, file);
  }
});

test('chrome keeps insertable streams on the main thread and safari moves only the track endpoints into a worker', async () => {
  const support = loadFile(path.join(__dirname, '../src/modules/virtual-background/plugin/core/insertable-support.ts'));
  assert.equal(support.mainThreadInsertableStreams({}), false);
  assert.equal(support.mainThreadInsertableStreams({ MediaStreamTrackProcessor: function Processor() {}, MediaStreamTrackGenerator: function Generator() {} }), true);

  class MainProcessor {
    constructor(init) { this.track = init.track; this.readable = { pipeThrough() { return { pipeTo: () => Promise.resolve() }; } }; }
  }
  class MainGenerator {
    constructor() { this.kind = 'video'; this.writable = {}; }
    stop() { this.stopped = true; }
  }
  const main = loadFile(path.join(__dirname, '../src/modules/virtual-background/plugin/core/track-pipeline.ts'), {}, {
    MediaStreamTrackProcessor: MainProcessor,
    MediaStreamTrackGenerator: MainGenerator,
    TransformStream: class TransformStream {}
  });
  const source = new Track('video');
  const mainOutput = await main.connectVideoPipeline(source, async () => {}, new AbortController().signal, () => { throw new Error('主线程已支持时不应创建 Worker'); });
  assert.equal(mainOutput instanceof MainGenerator, true);
  assert.equal(mainOutput.stopped, undefined);

  const posted = [];
  let worker;
  class FakeWorker {
    constructor() { worker = this; }
    postMessage(data, transfer) { posted.push({ type: data.type, track: data.track, frame: data.frame, transfer }); }
    terminate() { this.terminated = true; }
  }
  const safari = loadFile(path.join(__dirname, '../src/modules/virtual-background/plugin/core/track-pipeline.ts'));
  const camera = new Track('video');
  const clone = new Track('video');
  camera.clone = () => clone;
  const controller = new AbortController();
  const opening = safari.connectVideoPipeline(camera, async (frame, sink) => {
    sink.enqueue({ id: 'out', close() {}, source: frame });
  }, controller.signal, () => new FakeWorker());
  assert.equal(posted[0].type, 'start');
  assert.equal(posted[0].track, clone);
  assert.equal(posted[0].transfer[0], clone);
  const output = new Track('video');
  worker.onmessage({ data: { type: 'ready', track: output } });
  assert.equal(await opening, output);
  worker.onmessage({ data: { type: 'frame', frame: { id: 'in', close() { this.closed = true; } } } });
  await flush();
  assert.equal(posted.at(-1).type, 'frame');
  assert.equal(posted.at(-1).frame.id, 'out');
  assert.equal(posted.at(-1).transfer[0], posted.at(-1).frame);
  controller.abort();
  assert.equal(posted.at(-1).type, 'stop');

  const workerSource = fs.readFileSync(path.join(__dirname, '../src/modules/virtual-background/plugin/core/safari-track.worker.ts'), 'utf8');
  assert.match(workerSource, /VideoTrackGenerator/);
  assert.match(workerSource, /MediaStreamTrackProcessor/);
  assert.equal(workerSource.includes('new Image'), false);
  assert.equal(workerSource.includes('createElement'), false);
  const processor = fs.readFileSync(path.join(__dirname, '../src/modules/virtual-background/plugin/core/processor.ts'), 'utf8');
  assert.match(processor, /safari-track\.worker\.ts/);
  assert.match(processor, /connectVideoPipeline/);

  const messages = [];
  const sandbox = {
    console,
    messages,
    postMessage(message, transfer) { sandbox.messages.push({ message, transfer }); },
    close() { sandbox.closed = true; },
    MediaStreamTrackProcessor: class {
      constructor(init) { this.track = init.track; }
      readable = { getReader: () => ({ read: async () => ({ done: true, value: undefined }), cancel: async () => {} }) };
    },
    VideoTrackGenerator: class {
      constructor() { this.track = new Track('video'); this.writable = { getWriter: () => ({ write: async () => {}, close: async () => {} }) }; }
    }
  };
  const { outputText } = ts.transpileModule(workerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const module = { exports: {} };
  sandbox.module = module;
  sandbox.exports = module.exports;
  sandbox.require = require;
  vm.runInNewContext(outputText, sandbox, { filename: 'safari-track.worker.ts' });
  const input = new Track('video');
  sandbox.onmessage({ data: { type: 'start', track: input } });
  assert.equal(sandbox.messages[0].message.type, 'ready');
  assert.equal(sandbox.messages[0].transfer[0], sandbox.messages[0].message.track);
  await flush();
  assert.equal(input.readyState, 'ended');
  assert.equal(sandbox.closed, true);

  const missing = { console, messages: [], postMessage(message) { missing.messages.push(message); }, close() { missing.closed = true; } };
  const missingModule = { exports: {} };
  missing.module = missingModule;
  missing.exports = missingModule.exports;
  missing.require = require;
  vm.runInNewContext(outputText, missing, { filename: 'safari-track.worker.ts' });
  const rejected = new Track('video');
  missing.onmessage({ data: { type: 'start', track: rejected } });
  assert.equal(missing.messages[0].type, 'error');
  assert.equal(rejected.readyState, 'ended');
  assert.equal(missing.messages[0].message.includes('不支持'), false);
});
