const { randomUUID, createHmac } = require('node:crypto');

const MAX_PARTICIPANTS = 4;

function fail(message, code = 'CALL_INVALID') {
  throw Object.assign(new Error(message), { code });
}

// TURN shared secrets stay on the server. Only short-lived credentials reach members.
function getIceConfiguration(env = process.env, now = Date.now()) {
  const stun = (env.WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map((url) => url.trim()).filter(Boolean);
  const turns = (env.WEBRTC_TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
  if (stun.some((url) => !/^stuns?:[^\s]+$/.test(url)) || turns.some((url) => !/^turns?:[^\s]+$/.test(url))) {
    fail('通话网络配置无效，请联系管理员', 'CALL_CONFIG');
  }
  const iceServers = stun.length ? [{ urls: stun }] : [];
  if (turns.length) {
    if (!env.WEBRTC_TURN_SECRET) fail('通话中继尚未配置，请联系管理员', 'CALL_CONFIG');
    const username = `${Math.floor(now / 1000) + 86400}:${randomUUID()}`;
    iceServers.push({ urls: turns, username, credential: createHmac('sha1', env.WEBRTC_TURN_SECRET).update(username).digest('base64') });
  }
  const iceTransportPolicy = env.WEBRTC_RELAY_ONLY === 'true' ? 'relay' : 'all';
  if (iceTransportPolicy === 'relay' && !turns.length) fail('通话中继尚未配置，请联系管理员', 'CALL_CONFIG');
  return { iceServers, iceTransportPolicy };
}

class CallSignaling {
  constructor({ requireJoinedRoom, waitingTimeout = 60 * 60 * 1000, env = process.env }) {
    this.requireJoinedRoom = requireJoinedRoom;
    this.waitingTimeout = waitingTimeout;
    this.env = env;
    this.calls = new Map();
    this.users = new Map();
    this.revision = 0;
  }

  snapshot(roomId, reason) {
    const call = this.calls.get(roomId);
    return {
      roomId, revision: this.revision, ...(reason ? { reason } : {}),
      call: call ? {
        id: call.id, roomId, mode: call.mode, startedAt: call.startedAt,
        maxParticipants: MAX_PARTICIPANTS,
        participants: [...call.members.values()].map(({ participant }) => participant)
      } : null
    };
  }

  broadcast(io, roomId, reason) {
    this.revision += 1;
    io.to(roomId).emit('call:state', this.snapshot(roomId, reason));
  }

  scheduleWaiting(io, call) {
    clearTimeout(call.timer);
    if (call.members.size !== 1) return;
    call.timer = setTimeout(() => {
      if (this.calls.get(call.roomId) !== call) return;
      for (const member of call.members.values()) this.users.delete(member.userId);
      this.calls.delete(call.roomId);
      this.broadcast(io, call.roomId, 'timeout');
    }, this.waitingTimeout);
    call.timer.unref?.();
  }

  leave(socket, io, reason = 'left') {
    const call = this.calls.get(socket.data.roomId);
    const member = call?.members.get(socket.id);
    if (!member) return;
    call.members.delete(socket.id);
    this.users.delete(member.userId);
    clearTimeout(call.timer);
    // A removed member also receives the state before its room membership is removed.
    if (!call.members.size) this.calls.delete(call.roomId);
    else this.scheduleWaiting(io, call);
    this.broadcast(io, call.roomId, reason);
  }

  member(socket, payload) {
    this.requireJoinedRoom(socket, payload?.roomId);
    const call = this.calls.get(payload.roomId);
    if (!call || call.id !== payload.callId || !call.members.has(socket.id)) fail('通话已结束，请重新加入', 'CALL_ENDED');
    return call;
  }

  bind(socket, io) {
    const listen = (event, action) => socket.on(event, (payload, ack) => {
      try {
        // Bound signaling traffic independently of chat messages.
        const now = Date.now();
        if (!socket.data.callRate || now - socket.data.callRate.at > 10000) socket.data.callRate = { at: now, count: 0 };
        if (++socket.data.callRate.count > 240 && event !== 'call:leave') fail('操作过于频繁，请稍后重试', 'CALL_RATE_LIMIT');
        const data = action(payload);
        if (typeof ack === 'function') ack({ ok: true, data });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, error: error.message, code: error.code || 'CALL_INVALID' });
      }
    });

    listen('call:state', (payload) => {
      this.requireJoinedRoom(socket, payload?.roomId);
      return this.snapshot(payload.roomId);
    });

    listen('call:join', (payload) => {
      const user = this.requireJoinedRoom(socket, payload?.roomId);
      if (!['audio', 'video'].includes(payload.mode) || typeof payload.attemptId !== 'string' || !/^[\w-]{8,80}$/.test(payload.attemptId)) fail('通话参数无效');
      if (typeof payload.cameraEnabled !== 'boolean' || typeof payload.microphoneEnabled !== 'boolean') fail('设备状态无效');
      let call = this.calls.get(payload.roomId);
      if (payload.callId && call?.id !== payload.callId) fail('通话已结束，请重新发起', 'CALL_ENDED');
      const existing = call?.members.get(socket.id);
      if (existing && existing.attemptId !== payload.attemptId) fail('请先结束当前通话', 'CALL_BUSY');
      if (this.users.has(user.id) && !existing) fail('你已在另一窗口通话，请先挂断', 'CALL_BUSY');
      if (!existing && call?.members.size >= MAX_PARTICIPANTS) fail('通话已满，最多支持 4 人', 'CALL_FULL');
      const configuration = getIceConfiguration(this.env);
      if (!call) {
        call = { id: randomUUID(), roomId: payload.roomId, mode: payload.mode, startedAt: Date.now(), members: new Map() };
        this.calls.set(call.roomId, call);
      }
      if (!existing) {
        call.members.set(socket.id, {
          userId: user.id, attemptId: payload.attemptId,
          participant: { peerId: socket.id, userId: user.userId, name: user.name, avatarUrl: user.avatarUrl || '', microphoneEnabled: payload.microphoneEnabled, cameraEnabled: payload.cameraEnabled }
        });
        this.users.set(user.id, socket.id);
        this.scheduleWaiting(io, call);
        this.broadcast(io, call.roomId);
      }
      return { ...this.snapshot(call.roomId), selfId: socket.id, configuration };
    });

    listen('call:leave', (payload) => {
      this.requireJoinedRoom(socket, payload?.roomId);
      const call = this.calls.get(payload.roomId);
      const member = call?.members.get(socket.id);
      // An acknowledgement may arrive after cancellation or a later call started.
      if (member && member.attemptId === payload.attemptId) this.leave(socket, io);
      return null;
    });

    listen('call:media', (payload) => {
      const call = this.member(socket, payload);
      if (typeof payload.cameraEnabled !== 'boolean' || typeof payload.microphoneEnabled !== 'boolean') fail('设备状态无效');
      Object.assign(call.members.get(socket.id).participant, { cameraEnabled: payload.cameraEnabled, microphoneEnabled: payload.microphoneEnabled });
      this.broadcast(io, call.roomId);
      return null;
    });

    listen('call:signal', (payload) => {
      const call = this.member(socket, payload);
      const target = io.sockets.sockets.get(payload.to);
      if (payload.to === socket.id || !target || !call.members.has(payload.to)) fail('对方已离开通话', 'CALL_PEER_LEFT');
      this.requireJoinedRoom(target, call.roomId);
      const signal = { roomId: call.roomId, callId: call.id, from: socket.id };
      if (payload.description && !payload.candidate) {
        const { type, sdp } = payload.description;
        if (!['offer', 'answer'].includes(type) || typeof sdp !== 'string' || sdp.length > 65536) fail('无效的通话描述');
        signal.description = { type, sdp };
      } else if (payload.candidate && !payload.description) {
        const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = payload.candidate;
        if (typeof candidate !== 'string' || candidate.length > 4096 ||
            (sdpMid != null && (typeof sdpMid !== 'string' || sdpMid.length > 256)) ||
            (sdpMLineIndex != null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 32)) ||
            (usernameFragment != null && (typeof usernameFragment !== 'string' || usernameFragment.length > 256))) fail('无效的网络候选');
        signal.candidate = { candidate, sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null, ...(usernameFragment ? { usernameFragment } : {}) };
      } else fail('无效的通话信令');
      target.emit('call:signal', signal);
      return null;
    });
  }
}

module.exports = { CallSignaling, getIceConfiguration, MAX_PARTICIPANTS };
