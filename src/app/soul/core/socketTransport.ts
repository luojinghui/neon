import { io, type Socket } from 'socket.io-client';
import type {
  ChatRoom,
  ChatUser,
  CreateRoomInput,
  HistoryPage,
  JoinRoomResult,
  MessageDeletedEvent,
  OutgoingMessage,
  RoomAccessChangedEvent,
  RoomAccessManagement,
  RoomAccessSummary,
  RoomDeletedEvent,
  ServerChatMessage,
  UpdateRoomInput
} from './types';

type Ack<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; data?: unknown };
type Unsubscribe = () => void;

export class SocketChatError extends Error {
  constructor(message: string, public readonly code = '', public readonly data?: unknown) {
    super(message);
    this.name = 'SocketChatError';
  }
}

export class SocketChatTransport {
  private socket: Socket | null = null;

  public connect(user: ChatUser): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();
    if (!this.socket) {
      this.socket = io({ path: '/im', autoConnect: false, transports: ['websocket', 'polling'], auth: { user } });
    } else {
      this.socket.auth = { user };
    }

    return new Promise((resolve, reject) => {
      const socket = this.requireSocket();
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('连接聊天服务超时'));
      }, 8000);
      const cleanup = () => {
        window.clearTimeout(timer);
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleError);
      };
      const handleConnect = () => {
        cleanup();
        resolve();
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(new Error(error.message || '聊天服务连接失败'));
      };

      socket.once('connect', handleConnect);
      socket.once('connect_error', handleError);
      socket.connect();
    });
  }

  public disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  public listRooms(): Promise<ChatRoom[]> {
    return this.emitWithAck<ChatRoom[]>('rooms:list');
  }

  public createRoom(input: CreateRoomInput): Promise<ChatRoom> {
    return this.emitWithAck<ChatRoom>('rooms:create', input);
  }

  public updateRoom(input: UpdateRoomInput): Promise<ChatRoom> {
    return this.emitWithAck<ChatRoom>('rooms:update', input);
  }

  public deleteRoom(roomId: string): Promise<{ roomId: string }> {
    return this.emitWithAck<{ roomId: string }>('rooms:delete', { roomId });
  }

  public searchRoom(query: string): Promise<ChatRoom | null> {
    return this.emitWithAck<ChatRoom | null>('rooms:search', { query });
  }

  public joinRoom(roomId: string, password = '', inviteToken = ''): Promise<JoinRoomResult> {
    return this.emitWithAck<JoinRoomResult>('room:join', { roomId, password, inviteToken });
  }

  public requestRoomAccess(roomId: string): Promise<{ access: RoomAccessSummary }> {
    return this.emitWithAck<{ access: RoomAccessSummary }>('room:access:request', { roomId });
  }

  public getRoomAccessManagement(roomId: string): Promise<RoomAccessManagement> {
    return this.emitWithAck<RoomAccessManagement>('room:access:list', { roomId });
  }

  public decideRoomAccess(roomId: string, requesterId: string, decision: 'approved' | 'rejected'): Promise<RoomAccessManagement> {
    return this.emitWithAck<RoomAccessManagement>('room:access:decide', { roomId, requesterId, decision });
  }

  public revokeRoomAccess(roomId: string, requesterId: string): Promise<RoomAccessManagement> {
    return this.emitWithAck<RoomAccessManagement>('room:access:revoke', { roomId, requesterId });
  }

  public rotateRoomInvite(roomId: string): Promise<{ roomId: string; inviteToken: string }> {
    return this.emitWithAck<{ roomId: string; inviteToken: string }>('room:invite:rotate', { roomId });
  }

  public leaveRoom(): Promise<null> {
    return this.emitWithAck<null>('room:leave');
  }

  public getHistory(roomId: string, before: number | null, limit = 50): Promise<HistoryPage> {
    return this.emitWithAck<HistoryPage>('chat:history', { roomId, before, limit });
  }

  public sendMessage(roomId: string, message: OutgoingMessage): Promise<ServerChatMessage> {
    return this.emitWithAck<ServerChatMessage>('chat:send', { roomId, ...message });
  }

  public deleteMessage(roomId: string, messageId: string): Promise<MessageDeletedEvent> {
    return this.emitWithAck<MessageDeletedEvent>('chat:delete', { roomId, messageId });
  }

  public onMessage(listener: (message: ServerChatMessage) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('chat:message', listener);
    return () => socket.off('chat:message', listener);
  }

  public onMessageDeleted(listener: (event: MessageDeletedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('chat:deleted', listener);
    return () => socket.off('chat:deleted', listener);
  }

  public onRoomsChanged(listener: () => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('rooms:changed', listener);
    return () => socket.off('rooms:changed', listener);
  }

  public onRoomUpdated(listener: (room: ChatRoom) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('room:updated', listener);
    return () => socket.off('room:updated', listener);
  }

  public onRoomDeleted(listener: (event: RoomDeletedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('room:deleted', listener);
    return () => socket.off('room:deleted', listener);
  }

  public onRoomAccessChanged(listener: (event: RoomAccessChangedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('room:access:changed', listener);
    return () => socket.off('room:access:changed', listener);
  }

  public onRoomAccessRequested(listener: (event: RoomAccessChangedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('room:access:requested', listener);
    return () => socket.off('room:access:requested', listener);
  }

  public onConnectionChange(listener: (connected: boolean) => void): Unsubscribe {
    const socket = this.requireSocket();
    const onConnect = () => listener(true);
    const onDisconnect = () => listener(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }

  private emitWithAck<T>(event: string, payload?: unknown): Promise<T> {
    const socket = this.requireSocket();
    if (!socket.connected) return Promise.reject(new Error('聊天服务未连接'));

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('请求超时，请重试')), 8000);
      const ack = (response: Ack<T>) => {
        window.clearTimeout(timer);
        if (response?.ok) resolve(response.data);
        else reject(new SocketChatError(response?.error || '请求失败', response?.code, response?.data));
      };

      if (payload === undefined) socket.emit(event, ack);
      else socket.emit(event, payload, ack);
    });
  }

  private requireSocket(): Socket {
    if (!this.socket) throw new Error('聊天服务尚未初始化');
    return this.socket;
  }
}
