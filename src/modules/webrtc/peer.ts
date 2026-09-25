import type { CallSignal, PeerView } from './types';

interface PeerOptions {
  configuration: RTCConfiguration;
  localStream: MediaStream;
  screenStream?: MediaStream | null;
  polite: boolean;
  send: (signal: Pick<CallSignal, 'description' | 'candidate' | 'screenStreamId'>) => Promise<void>;
  onChange: (view: PeerView) => void;
  onError: (error: unknown) => void;
}

/** Perfect negotiation isolates simultaneous offers and buffers early ICE candidates. */
export class CallPeer {
  private readonly connection: RTCPeerConnection;
  private readonly remoteStream = new MediaStream();
  private readonly screenStream = new MediaStream();
  private readonly outgoingScreenStream = new MediaStream();
  private remoteScreenId = '';
  private readonly senders: Record<'audio' | 'video' | 'screen', RTCRtpSender>;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private closed = false;
  private candidates: RTCIceCandidateInit[] = [];
  private signals: Promise<void> = Promise.resolve();
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;

  constructor(private readonly options: PeerOptions) {
    const pc = this.connection = new RTCPeerConnection(options.configuration);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) void options.send({ candidate: candidate.toJSON() }).catch((error) => this.report(error));
    };
    pc.ontrack = ({ track, streams }) => {
      // Offer-created receivers need not be the transceivers we created locally.
      // Stable stream IDs identify the screen even across renegotiation/late joins.
      const stream = streams?.some(stream => stream.id === this.remoteScreenId) ? this.screenStream : this.remoteStream;
      stream.addTrack(track);
      track.onended = () => { stream.removeTrack(track); this.publish(); };
      track.onunmute = () => this.publish();
      this.publish();
    };
    pc.onnegotiationneeded = async () => {
      // Elect one initial offerer. In a mesh, every new member otherwise causes
      // several simultaneous offers, and rolled-back ICE gathering can finish early.
      if (options.polite && !pc.remoteDescription) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        if (!this.closed && pc.localDescription) await options.send({ description: pc.localDescription.toJSON(), screenStreamId: this.outgoingScreenStream.id });
      } catch (error) { this.report(error); }
      finally { this.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      this.publish();
      if (pc.connectionState === 'connected') { clearTimeout(this.watchdog); this.retries = 0; }
      else if (pc.connectionState === 'failed') this.recover();
      else if (pc.connectionState === 'disconnected') this.armWatchdog(6000);
    };
    const audio = pc.addTransceiver(options.localStream.getAudioTracks()[0] || 'audio', { direction: 'sendrecv', streams: [options.localStream] }).sender;
    const video = pc.addTransceiver(options.localStream.getVideoTracks()[0] || 'video', { direction: 'sendrecv', streams: [options.localStream] }).sender;
    const screen = pc.addTransceiver(options.screenStream?.getVideoTracks()[0] || 'video', { direction: 'sendrecv', streams: [this.outgoingScreenStream] }).sender;
    this.senders = { audio, video, screen };
    this.armWatchdog(25000);
    this.publish();
  }

  private armWatchdog(delay: number): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.recover(), delay);
  }

  private recover(): void {
    if (this.closed || this.connection.connectionState === 'connected') return;
    if (this.retries++ === 0) {
      this.connection.restartIce();
      this.armWatchdog(20000);
    } else {
      this.options.onChange({ stream: this.remoteStream, screenStream: this.screenStream, connectionState: 'failed' });
      this.report(new Error('有成员连接失败，请检查网络后重新加入通话'));
    }
  }

  receive(signal: Pick<CallSignal, 'description' | 'candidate' | 'screenStreamId'>): Promise<void> {
    this.signals = this.signals.then(async () => {
      if (this.closed) return;
      const pc = this.connection;
      if (signal.description) {
        const ready = !this.makingOffer && (pc.signalingState === 'stable' || this.settingRemoteAnswer);
        const collision = signal.description.type === 'offer' && !ready;
        this.ignoreOffer = !this.options.polite && collision;
        if (this.ignoreOffer) return;
        this.remoteScreenId = signal.screenStreamId || '';
        this.settingRemoteAnswer = signal.description.type === 'answer';
        try { await pc.setRemoteDescription(signal.description); }
        finally { this.settingRemoteAnswer = false; }
        for (const candidate of this.candidates.splice(0)) await this.addCandidate(candidate);
        if (signal.description.type === 'offer') {
          await pc.setLocalDescription();
          if (!this.closed && pc.localDescription) await this.options.send({ description: pc.localDescription.toJSON(), screenStreamId: this.outgoingScreenStream.id });
        }
      } else if (signal.candidate) {
        if (this.ignoreOffer) {
          if (this.candidates.length < 128) this.candidates.push(signal.candidate);
        } else await this.addCandidate(signal.candidate);
      }
    }).catch((error) => this.report(error));
    return this.signals;
  }

  private async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const remote = this.connection.remoteDescription;
    // An answer may reuse the ICE generation of a rolled-back offer. Keep its
    // early candidates until that description arrives instead of losing them.
    const matches = !candidate.usernameFragment || remote?.sdp.split(/\r?\n/).includes(`a=ice-ufrag:${candidate.usernameFragment}`);
    if (!remote || !matches) {
      if (this.candidates.length < 128) this.candidates.push(candidate);
      return;
    }
    await this.connection.addIceCandidate(candidate);
  }

  async replace(kind: 'audio' | 'video' | 'screen', track: MediaStreamTrack | null): Promise<void> {
    if (!this.closed) await this.senders[kind].replaceTrack(track);
  }

  private publish(): void {
    if (!this.closed) this.options.onChange({ stream: this.remoteStream, screenStream: this.screenStream, connectionState: this.connection.connectionState });
  }

  private report(error: unknown): void {
    if (!this.closed) this.options.onError(error);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.watchdog);
    this.connection.onicecandidate = null;
    this.connection.ontrack = null;
    this.connection.onnegotiationneeded = null;
    this.connection.onconnectionstatechange = null;
    this.connection.close();
    this.remoteStream.getTracks().forEach((track) => { track.onended = null; track.onunmute = null; track.stop(); });
    this.screenStream.getTracks().forEach((track) => { track.onended = null; track.onunmute = null; track.stop(); });
    this.candidates = [];
  }
}
