export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type RoomAccessState = 'joining' | 'password-required' | 'granted' | 'error' | 'deleted';

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
  onlineCount: number;
  status: 'online';
  isPrivate: boolean;
  hasPassword: boolean;
  isOwner: boolean;
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
