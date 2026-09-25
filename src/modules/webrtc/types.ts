export type CallMode = 'audio' | 'video';
export interface CallParticipant {
  peerId: string;
  userId: string;
  name: string;
  avatarUrl: string;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
}
export interface RoomCall {
  id: string;
  roomId: string;
  mode: CallMode;
  startedAt: number;
  maxParticipants: number;
  participants: CallParticipant[];
}
export interface CallSnapshot {
  roomId: string;
  revision: number;
  call: RoomCall | null;
  reason?: string;
}
export interface JoinCallResult extends CallSnapshot {
  selfId: string;
  configuration: RTCConfiguration;
}
export interface CallSignal {
  roomId: string;
  callId: string;
  from: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
// No React, Socket.IO or chat-store dependency in the WebRTC engine.
export interface CallTransport {
  request<T>(event: string, payload: unknown): Promise<T>;
  onState(listener: (snapshot: CallSnapshot) => void): () => void;
  onSignal(listener: (signal: CallSignal) => void): () => void;
}
export interface PeerView {
  stream: MediaStream;
  connectionState: RTCPeerConnectionState;
}
export interface CallView {
  phase: 'idle' | 'joining' | 'active';
  call: RoomCall | null;
  selfId: string;
  localStream: MediaStream | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  mediaBusy: boolean;
  peers: Record<string, PeerView>;
  error: string;
  joinedAt: number | null;
  effects: VideoEffectsSettings;
  effectsStatus: VideoEffectsStatus;
}
import type { VideoEffectsSettings, VideoEffectsStatus } from '../video-effects/types';
