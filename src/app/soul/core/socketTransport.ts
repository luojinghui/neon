import { io, type Socket } from 'socket.io-client';
import type {
  ChatRoom,
  ChatUser,
  CreateRoomInput,
  HistoryPage,
  JoinRoomResult,
  MessageDeletedEvent,
  OutgoingMessage,
  RoomDeletedEvent,
  ServerChatMessage,
  UpdateRoomInput
} from './types';

type Ack<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
type Unsubscribe = () => void;

export class SocketChatError extends Error {
  constructor(message: string, public readonly code = '') {
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

  public joinRoom(roomId: string, password = ''): Promise<JoinRoomResult> {
    return this.emitWithAck<JoinRoomResult>('room:join', { roomId, password });
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
        else reject(new SocketChatError(response?.error || '请求失败', response?.code));
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
