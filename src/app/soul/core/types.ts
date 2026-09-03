export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type RoomAccessState =
  | 'joining'
  | 'password-required'
  | 'application-required'
  | 'application-pending'
  | 'application-rejected'
  | 'application-exhausted'
  | 'granted'
  | 'error'
  | 'deleted';
export type RoomMembership = 'public' | 'owner' | 'approved' | 'admin' | 'none';
export type RoomApplicationStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface RoomAccessSummary {
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'exhausted';
  attemptCount: number;
  remainingAttempts: number;
}

export interface RoomAccessRecord {
  id: string;
  roomId: string;
  requesterId: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatarUrl: string;
  status: RoomApplicationStatus;
  source: 'request' | 'invite';
  attemptCount: number;
  createdAt: string;
  requestedAt: string;
  decidedAt?: string | null;
  updatedAt: string;
}

export interface RoomAccessManagement {
  roomId: string;
  inviteToken?: string;
  applications: RoomAccessRecord[];
  members: RoomAccessRecord[];
  pendingCount: number;
}

export interface ChatUser {
  uuid: string;
  publicKey: string;
  userId: string;
  name: string;
  avatarUrl: string;
}

export interface ChatRoom {
  id: string;
  code: string;
  name: string;
  description: string;
  tags: string[];
  onlineCount?: number;
  status: 'online';
  isPrivate: boolean;
  hasPassword: boolean;
  isOwner: boolean;
  isCreator: boolean;
  membership: RoomMembership;
  owner: { userId: string; name: string; avatarUrl: string };
  pendingRequestCount: number;
  access?: RoomAccessSummary;
  isFixed: boolean;
  createdAt: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateRoomInput {
  name: string;
  description: string;
  tags: string[];
  isPrivate: boolean;
  passwordEnabled: boolean;
  password?: string;
}

export interface UpdateRoomInput extends CreateRoomInput {
  roomId: string;
}

export type MessageType = 'text' | 'image' | 'gif' | 'video' | 'audio' | 'file' | 'link' | 'markdown' | 'music';

export interface ChatAttachment {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface OutgoingMessage {
  type: Extract<MessageType, 'text' | 'image' | 'gif' | 'file'>;
  content: string;
  attachment?: ChatAttachment;
}

export interface ServerChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderKey?: string;
  senderName: string;
  senderAvatar?: string;
  type: MessageType;
  content: string;
  timestamp: number;
  attachment?: ChatAttachment;
}

export interface ChatMessage extends ServerChatMessage {
  isLocal: boolean;
}

export interface HistoryPage {
  messages: ServerChatMessage[];
  hasMore: boolean;
  before: number | null;
}

export interface JoinRoomResult extends HistoryPage {
  room: ChatRoom;
}

export interface MessageDeletedEvent {
  roomId: string;
  messageId: string;
}

export interface RoomDeletedEvent {
  roomId: string;
}

export interface RoomAccessChangedEvent {
  roomId: string;
  access?: RoomAccessSummary;
  pendingRequestCount?: number;
}

export interface RoomAccessGateData {
  room: ChatRoom;
  access: RoomAccessSummary;
}
