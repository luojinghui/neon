import { assertMediaSupport, LocalMedia, mediaError } from './media';
import { CallPeer } from './peer';
import { DEFAULT_VIDEO_EFFECTS, normalizeVideoEffects, type VideoEffectsSettings } from '../video-effects/types';
import type { CallMode, CallSignal, CallSnapshot, CallTransport, CallView, JoinCallResult } from './types';

const initialView = (): CallView => ({ phase: 'idle', call: null, selfId: '', localStream: null, microphoneEnabled: false, cameraEnabled: false, mediaBusy: false, peers: {}, error: '', joinedAt: null, effects: { ...DEFAULT_VIDEO_EFFECTS }, effectsStatus: { phase: 'off', progress: 0, message: '' } });

export class CallSession {
  private view = initialView();
  private listeners = new Set<() => void>();
  private unsubscribers: Array<() => void> = [];
  private peers = new Map<string, CallPeer>();
  private media: LocalMedia | null = null;
  private configuration: RTCConfiguration = {};
  private revision = -1;
  private operation = 0;
  private attemptId = '';
  private disposed = false;
  private earlySignals: CallSignal[] = [];
  private facingMode: 'user' | 'environment' = 'user';

  constructor(private readonly roomId: string, private readonly transport: CallTransport) {}

  getSnapshot = (): CallView => this.view;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<CallView>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  clearError = (): void => this.update({ error: '' });

  async connect(): Promise<void> {
    this.unsubscribers.push(this.transport.onState(this.receiveState), this.transport.onSignal(this.receiveSignal));
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try { this.receiveState(await this.transport.request<CallSnapshot>('call:state', { roomId: this.roomId })); }
    catch (error) { this.update({ error: mediaError(error) }); }
  }

  private receiveState = (snapshot: CallSnapshot): void => {
    if (this.disposed || snapshot.roomId !== this.roomId || snapshot.revision < this.revision) return;
    this.revision = snapshot.revision;
    if (this.view.phase === 'active' && (snapshot.call?.id !== this.view.call?.id || !snapshot.call?.participants.some((member) => member.peerId === this.view.selfId))) {
      this.release();
      this.update({ ...initialView(), error: snapshot.reason === 'timeout' ? '暂时没有其他成员加入，通话已结束' : '通话已结束' });
    }
    this.update({ call: snapshot.call });
    if (this.view.phase === 'active') this.syncPeers();
  };

  private receiveSignal = (signal: CallSignal): void => {
    if (this.disposed || signal.roomId !== this.roomId) return;
    if (this.view.phase === 'joining') {
      if (this.earlySignals.length < 256) this.earlySignals.push(signal);
      return;
    }
    if (this.view.phase !== 'active' || signal.callId !== this.view.call?.id) return;
    void this.peers.get(signal.from)?.receive(signal);
  };

  async join(mode: CallMode): Promise<void> {
    if (this.disposed || this.view.phase !== 'idle') return;
    const operation = ++this.operation;
    const expectedCallId = this.view.call?.id;
    const attemptId = this.attemptId = crypto.randomUUID();
    this.update({ phase: 'joining', error: '' });
    try {
      assertMediaSupport();
      const media = this.media = new LocalMedia();
      media.onEffectsStatus = effectsStatus => { if (operation === this.operation) this.update({ effectsStatus }); };
      media.onVideoEnded = () => {
        if (operation !== this.operation || this.view.phase !== 'active') return;
        this.publishMedia();
        this.update({ error: '摄像头已停止' });
      };
      media.onVideoOutput = track => {
        if (operation !== this.operation || this.view.phase !== 'active') return;
        this.update({ localStream: new MediaStream(media.stream.getTracks()) });
        void Promise.all([...this.peers.values()].map(peer => peer.replace('video', track))).catch(error => {
          if (operation === this.operation) this.update({ error: mediaError(error) });
        });
      };
      await media.enable('audio');
      if (operation !== this.operation || this.disposed) return;
      // Selecting video is the explicit camera action; voice and incoming joins never capture video.
      if (mode === 'video') await media.enable('video');
      if (operation !== this.operation || this.disposed) return;
      const result = await this.transport.request<JoinCallResult>('call:join', { roomId: this.roomId, callId: expectedCallId, attemptId, mode, microphoneEnabled: true, cameraEnabled: mode === 'video' });
      if (operation !== this.operation || this.disposed) { this.leaveAttempt(attemptId); return; }
      // A newer end/kick event can overtake the acknowledgement.
      const call = this.revision > result.revision ? this.view.call : result.call;
      if (!call || call.id !== result.call?.id || !call.participants.some((member) => member.peerId === result.selfId)) throw new Error('通话已结束，请重新发起');
      this.revision = Math.max(this.revision, result.revision);
      this.configuration = result.configuration;
      this.update({ phase: 'active', call, selfId: result.selfId, localStream: media.stream, microphoneEnabled: true, cameraEnabled: mode === 'video', joinedAt: Date.now() });
      this.watchTracks();
      this.syncPeers();
      for (const signal of this.earlySignals.splice(0)) this.receiveSignal(signal);
    } catch (error) {
      if (operation !== this.operation || this.disposed) return;
      this.leaveAttempt(attemptId);
      this.release();
      this.update({ ...initialView(), call: this.view.call, error: mediaError(error) });
      void this.refresh();
    }
  }

  private syncPeers(): void {
    if (!this.media || !this.view.call) return;
    const callId = this.view.call.id;
    const members = this.view.call.participants.filter((member) => member.peerId !== this.view.selfId);
    for (const [id, peer] of this.peers) {
      if (!members.some((member) => member.peerId === id)) {
        peer.close(); this.peers.delete(id);
        const peers = { ...this.view.peers }; delete peers[id]; this.update({ peers });
      }
    }
    for (const member of members) {
      if (this.peers.has(member.peerId)) continue;
      const operation = this.operation;
      const peer = new CallPeer({
        configuration: this.configuration, localStream: this.media.stream, polite: this.view.selfId > member.peerId,
        send: (signal) => this.transport.request('call:signal', { roomId: this.roomId, callId, to: member.peerId, ...signal }),
        onChange: (view) => { if (operation === this.operation) this.update({ peers: { ...this.view.peers, [member.peerId]: view } }); },
        onError: (error) => { if (operation === this.operation) this.update({ error: mediaError(error) }); }
      });
      this.peers.set(member.peerId, peer);
    }
  }

  private watchTracks(): void {
    this.media?.stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (this.view.phase !== 'active') return;
        this.media?.stream.removeTrack(track);
        this.publishMedia();
        this.update({ error: track.kind === 'video' ? '摄像头已停止，可点击重新开启' : '麦克风已停止，可点击重新开启' });
      };
    });
  }

  setEffects(settings: Partial<VideoEffectsSettings>): void {
    if (this.view.phase !== 'active' || this.disposed) return;
    const effects = normalizeVideoEffects({ ...this.view.effects, ...settings });
    this.update({ effects });
    this.media?.setEffects(effects);
  }

  private publishMedia(): void {
    if (!this.media || this.view.phase !== 'active') return;
    const microphoneEnabled = this.media.stream.getAudioTracks().some((track) => track.readyState === 'live');
    const cameraEnabled = this.media.stream.getVideoTracks().some((track) => track.readyState === 'live');
    this.update({ microphoneEnabled, cameraEnabled, localStream: new MediaStream(this.media.stream.getTracks()) });
    const operation = this.operation;
    void this.transport.request('call:media', { roomId: this.roomId, callId: this.view.call?.id, microphoneEnabled, cameraEnabled }).catch((error) => {
      if (operation === this.operation) this.update({ error: mediaError(error) });
    });
  }

  async toggleDevice(kind: 'audio' | 'video', switchCamera = false): Promise<void> {
    if (!this.media || this.view.phase !== 'active' || this.view.mediaBusy) return;
    const media = this.media;
    const operation = this.operation;
    const enabled = kind === 'audio' ? this.view.microphoneEnabled : this.view.cameraEnabled;
    this.update({ mediaBusy: true, error: '' });
    try {
      if (enabled) {
        // Stop immediately, even if replacing a sender or requesting the other camera fails.
        media.disable(kind);
        this.publishMedia();
        await Promise.all([...this.peers.values()].map((peer) => peer.replace(kind, null)));
      }
      if (operation !== this.operation || this.disposed) return;
      if (!enabled || switchCamera) {
        if (switchCamera) this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        await media.enable(kind, this.facingMode);
        if (operation !== this.operation || this.disposed) return;
        const track = media.stream.getTracks().find((entry) => entry.kind === kind) || null;
        await Promise.all([...this.peers.values()].map((peer) => peer.replace(kind, track)));
        this.watchTracks();
      }
    } catch (error) {
      // If transmission fails, do not leave an unadvertised camera capturing.
      media.disable(kind);
      if (operation === this.operation) this.update({ error: mediaError(error) });
    } finally {
      if (operation === this.operation && !this.disposed) { this.publishMedia(); this.update({ mediaBusy: false }); }
    }
  }

  private leaveAttempt(attemptId: string): void {
    if (attemptId) void this.transport.request('call:leave', { roomId: this.roomId, attemptId }).catch(() => undefined);
  }

  hangup = (): void => {
    this.leaveAttempt(this.attemptId);
    this.release();
    this.update({ ...initialView(), call: this.view.call });
  };

  private release(): void {
    this.operation += 1;
    this.media?.dispose(); this.media = null;
    this.peers.forEach((peer) => peer.close()); this.peers.clear();
    this.earlySignals = [];
    this.attemptId = '';
    this.facingMode = 'user';
  }

  dispose(): void {
    this.hangup();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.disposed = true;
    this.listeners.clear();
  }
}
