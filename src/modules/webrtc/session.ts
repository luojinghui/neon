import { assertMediaSupport, LocalMedia, mediaError } from './media';
import { CallPeer } from './peer';
import { DEFAULT_VIDEO_EFFECTS, normalizeVideoEffects, type VideoEffectsSettings } from '../video-effects/types';
import type { CallMode, CallSignal, CallSnapshot, CallTransport, CallView, JoinCallResult } from './types';
import { applyBoardAction, type BoardItem, type Presentation, type ShareSnapshot } from './sharing';

const initialView = (): CallView => ({ phase: 'idle', call: null, selfId: '', localStream: null, microphoneEnabled: false, cameraEnabled: false, mediaBusy: false, peers: {}, error: '', joinedAt: null, effects: { ...DEFAULT_VIDEO_EFFECTS }, effectsStatus: { phase: 'off', progress: 0, message: '' }, presentation: null, screenStream: null, shareBusy: false, shareProgress: 0, shareCapabilities: { powerPoint: false, maxFileSize: 20 * 1024 * 1024 } });

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
  private departedCall: { id: string; peerId: string } | null = null;
  private shareToken = '';
  private shareRevision = -1;
  private shareOperation = 0;
  private display: MediaStream | null = null;
  private upload: XMLHttpRequest | null = null;
  private earlySharing: ShareSnapshot[] = [];

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
    this.unsubscribers.push(this.transport.onState(this.receiveState), this.transport.onSignal(this.receiveSignal), this.transport.onSharing(this.receiveSharing));
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
      this.update({ ...initialView(), error: snapshot.reason === 'timeout' ? '已独自等待一小时，通话已结束' : '通话已结束' });
    }
    let call = snapshot.call;
    if (this.view.phase === 'idle' && call && call.id === this.departedCall?.id) {
      const participants = call.participants.filter(member => member.peerId !== this.departedCall?.peerId);
      call = participants.length ? { ...call, participants } : null;
    }
    this.update({ call });
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
    this.departedCall = null;
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
      this.shareToken = result.shareToken;
      this.update({ phase: 'active', call, selfId: result.selfId, localStream: media.stream, microphoneEnabled: true, cameraEnabled: mode === 'video', joinedAt: Date.now(), ...(result.shareCapabilities ? { shareCapabilities: result.shareCapabilities } : {}) });
      if (result.sharing) this.receiveSharing(result.sharing);
      for (const state of this.earlySharing.splice(0)) this.receiveSharing(state);
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
        configuration: this.configuration, localStream: this.media.stream, screenStream: this.display, polite: this.view.selfId > member.peerId,
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

  private receiveSharing = (state: ShareSnapshot): void => {
    if (this.disposed || state.roomId !== this.roomId) return;
    if (this.view.phase === 'joining') { if (this.earlySharing.length < 256) this.earlySharing.push(state); return; }
    if (this.view.phase !== 'active' || state.callId !== this.view.call?.id || state.revision <= this.shareRevision) return;
    if (state.action && state.revision !== this.shareRevision + 1) {
      void this.transport.request<ShareSnapshot>('share:state', { roomId: this.roomId, callId: state.callId }).then(this.receiveSharing).catch(() => undefined);
      return;
    }
    this.shareRevision = state.revision;
    const presentation = state.action && this.view.presentation && this.view.presentation.id === state.shareId ? applyBoardAction(this.view.presentation, state.action) : state.presentation ?? null;
    if (this.display && (presentation?.kind !== 'screen' || presentation.ownerId !== this.view.selfId)) this.releaseScreen();
    this.update({ presentation });
  };

  private requestShare<T>(event: string, payload: object = {}): Promise<T> {
    if (this.view.phase !== 'active') return Promise.reject(new Error('请先加入通话'));
    return this.transport.request<T>(event, { roomId: this.roomId, callId: this.view.call!.id, shareId: this.view.presentation?.id, ...payload });
  }

  private async beginShare(kind: Presentation['kind'], extra: object = {}): Promise<ShareSnapshot> {
    const operation = this.shareOperation;
    const result = await this.requestShare<ShareSnapshot>('share:start', { kind, ...extra });
    if (operation !== this.shareOperation || this.view.phase !== 'active') {
      if (result.presentation) void this.transport.request('share:stop', { roomId: this.roomId, callId: result.callId, shareId: result.presentation.id }).catch(() => undefined);
      throw new Error('已取消共享');
    }
    this.receiveSharing(result);
    return result;
  }

  async startWhiteboard(): Promise<void> {
    if (this.view.shareBusy || (this.view.presentation && this.view.presentation.ownerId !== this.view.selfId)) return;
    if (this.view.presentation) {
      await this.stopSharing();
      if (this.view.presentation) return;
    }
    const operation = ++this.shareOperation;
    this.update({ shareBusy: true, error: '' });
    try { await this.beginShare('whiteboard'); }
    catch (error) { if (operation === this.shareOperation) this.update({ error: mediaError(error) }); }
    finally { if (operation === this.shareOperation) this.update({ shareBusy: false }); }
  }

  async startScreen(): Promise<void> {
    if (this.view.phase !== 'active' || this.view.shareBusy || (this.view.presentation && this.view.presentation.ownerId !== this.view.selfId)) return;
    let operation = 0;
    let shareId = '';
    let pendingDisplay: MediaStream | null = null;
    this.update({ shareBusy: true, error: '' });
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('当前浏览器不支持发起屏幕共享，请使用桌面版 Chrome、Edge 或 Firefox；你仍可观看其他人的共享');
      // Must be called directly from the click, before any network await.
      pendingDisplay = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const track = pendingDisplay.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('没有可共享的画面');
      if (this.view.phase !== 'active') return;
      if (this.view.presentation) {
        await this.stopSharing();
        if (this.view.presentation || this.view.phase !== 'active') return;
      }
      operation = ++this.shareOperation;
      this.update({ shareBusy: true });
      this.display = pendingDisplay;
      pendingDisplay = null;
      track.contentHint = 'detail';
      track.onended = () => { void this.stopSharing(); };
      this.update({ screenStream: this.display });
      const result = await this.beginShare('screen');
      shareId = result.presentation?.id || '';
      if (operation !== this.shareOperation) { if (shareId) await this.requestShare('share:stop', { shareId }).catch(() => undefined); return; }
      await Promise.all([...this.peers.values()].map(peer => peer.replace('screen', track)));
    } catch (error) {
      if (operation && operation === this.shareOperation) {
        this.releaseScreen();
        if (shareId) await this.requestShare('share:stop', { shareId }).then(state => this.receiveSharing(state as ShareSnapshot)).catch(() => undefined);
      }
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) this.update({ error: mediaError(error) });
    } finally {
      pendingDisplay?.getTracks().forEach(track => track.stop());
      if (!operation || operation === this.shareOperation) this.update({ shareBusy: false });
    }
  }

  private releaseScreen(publish = true): void {
    this.display?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.display = null;
    for (const peer of this.peers.values()) void peer.replace('screen', null).catch(() => undefined);
    if (publish) this.update({ screenStream: null });
  }

  async stopSharing(): Promise<void> {
    this.shareOperation++;
    const id = this.view.presentation?.ownerId === this.view.selfId ? this.view.presentation.id : null;
    this.releaseScreen(); this.upload?.abort(); this.upload = null;
    this.update({ shareBusy: false, shareProgress: 0 });
    if (!id) return;
    try { this.receiveSharing(await this.requestShare<ShareSnapshot>('share:stop', { shareId: id })); }
    catch (error) { if (this.view.phase === 'active') this.update({ error: mediaError(error) }); }
  }

  async shareFile(file: File): Promise<void> {
    if (this.view.phase !== 'active' || this.view.shareBusy || (this.view.presentation && this.view.presentation.ownerId !== this.view.selfId)) return;
    if (this.view.presentation) {
      await this.stopSharing();
      if (this.view.presentation) return;
    }
    const operation = ++this.shareOperation;
    let shareId = '';
    this.update({ shareBusy: true, shareProgress: 0, error: '' });
    try {
      const state = await this.beginShare('resource', { file: { name: file.name, size: file.size } });
      shareId = state.presentation!.id;
      if (operation !== this.shareOperation) return;
      await new Promise<void>((resolve, reject) => {
        const xhr = this.upload = new XMLHttpRequest();
        xhr.open('POST', `/api/call-share/${state.callId}/${shareId}`);
        xhr.setRequestHeader('Authorization', `Bearer ${this.shareToken}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.timeout = 90000;
        xhr.upload.onprogress = event => { if (operation === this.shareOperation && event.lengthComputable) this.update({ shareProgress: Math.round(event.loaded / event.total * 100) }); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else { let error = '文件上传失败，请重试'; try { error = JSON.parse(xhr.responseText).error || error; } catch {} reject(new Error(error)); }
        };
        xhr.onerror = () => reject(new Error('网络连接失败，请重试'));
        xhr.ontimeout = () => reject(new Error('文件处理超时，请导出 PDF 后重试'));
        xhr.onabort = () => reject(new Error('已取消共享'));
        xhr.send(file);
      });
    } catch (error) {
      if (operation === this.shareOperation) {
        if (shareId) await this.requestShare<ShareSnapshot>('share:stop', { shareId }).then(this.receiveSharing).catch(() => undefined);
        this.update({ error: mediaError(error) });
      }
    } finally { if (operation === this.shareOperation) { this.upload = null; this.update({ shareBusy: false }); } }
  }

  async resource(shareId: string, signal: AbortSignal): Promise<Blob> {
    const response = await fetch(`/api/call-share/${this.view.call?.id}/${shareId}`, { signal, headers: { Authorization: `Bearer ${this.shareToken}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('共享文件已失效或暂时不可用');
    return response.blob();
  }

  async navigateShare(page: number, scroll: number): Promise<void> {
    const shareId = this.view.presentation?.id;
    try { this.receiveSharing(await this.requestShare<ShareSnapshot>('share:navigate', { page, scroll })); }
    catch (error) { if (this.view.phase === 'active' && this.view.presentation?.id === shareId) this.update({ error: mediaError(error) }); }
  }

  async board(action: 'put' | 'undo' | 'clear', epoch: number, item?: BoardItem, shareId = this.view.presentation?.id): Promise<boolean> {
    try { await this.requestShare('share:board', { action, epoch, item, shareId }); return true; }
    catch (error) { if (this.view.phase === 'active' && this.view.presentation?.id === shareId) this.update({ error: mediaError(error) }); return false; }
  }

  hangup = (): void => {
    // Do not briefly advertise our own departed call above the chat composer
    // while waiting for the server's leave acknowledgement.
    const participants = this.view.call?.participants.filter(member => member.peerId !== this.view.selfId) || [];
    const call = this.view.call && participants.length ? { ...this.view.call, participants } : null;
    if (this.view.call && this.view.selfId) this.departedCall = { id: this.view.call.id, peerId: this.view.selfId };
    this.leaveAttempt(this.attemptId);
    this.release();
    this.update({ ...initialView(), call });
  };

  private release(): void {
    this.operation += 1;
    this.shareOperation++;
    this.upload?.abort(); this.upload = null;
    this.releaseScreen(false);
    this.shareToken = ''; this.shareRevision = -1; this.earlySharing = [];
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
