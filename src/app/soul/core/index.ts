import { useSoulStore } from '../store';
import { SocketChatTransport } from './socketTransport';
import type { ChatAttachment, ChatMessage, ChatRoom, ChatUser, CreateRoomInput, OutgoingMessage, ServerChatMessage } from './types';

const USER_STORAGE_KEY = 'soul:guest-user';
const CACHE_PREFIX = 'soul:room-cache:';
const CACHE_LIMIT = 100;

type CoreMode = 'list' | 'room' | null;

export class SoulChat {
  private readonly transport = new SocketChatTransport();
  private user: ChatUser | null = null;
  private mode: CoreMode = null;
  private roomId = '';
  private sessionId = 0;
  private unsubscribers: Array<() => void> = [];

  public async initList(): Promise<void> {
    const sessionId = ++this.sessionId;
    this.mode = 'list';
    this.roomId = '';
    this.user = this.getOrCreateGuest();
    const store = useSoulStore.getState();
    store.setRoomsState('loading');
    store.setConnectionState('connecting');

    try {
      await this.transport.connect();
      if (sessionId !== this.sessionId || this.mode !== 'list') return;
      this.bindCommonEvents();
      store.setConnectionState('connected');
      await this.loadRooms();
    } catch (error) {
      if (sessionId !== this.sessionId || this.mode !== 'list') return;
      const message = this.getErrorMessage(error);
      store.setConnectionState('error');
      store.setRoomsState('error', message);
    }
  }

  public async initRoom(roomId: string): Promise<void> {
    const sessionId = ++this.sessionId;
    this.mode = 'room';
    this.roomId = roomId;
    this.user = this.getOrCreateGuest();
    const store = useSoulStore.getState();
    store.prepareRoom(roomId);
    store.setConnectionState('connecting');
    const cachedMessages = this.loadCachedMessages(roomId);
    if (cachedMessages.length > 0) store.setMessages(cachedMessages);

    try {
      await this.transport.connect();
      if (sessionId !== this.sessionId || this.mode !== 'room' || this.roomId !== roomId) return;
      this.bindCommonEvents();
      this.unsubscribers.push(this.transport.onMessage((message) => this.handleIncomingMessage(message)));
      store.setConnectionState('connected');
      await this.joinRoom(roomId);
    } catch (error) {
      if (sessionId !== this.sessionId || this.mode !== 'room' || this.roomId !== roomId) return;
      store.setConnectionState('error');
      store.setChatError(this.getErrorMessage(error));
    }
  }

  public destroy(): void {
    this.sessionId += 1;
    this.mode = null;
    this.roomId = '';
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.transport.leaveRoom().catch(() => undefined);
    this.transport.disconnect();
    useSoulStore.getState().reset();
  }

  public async loadRooms(): Promise<void> {
    const store = useSoulStore.getState();
    store.setRoomsState('loading');
    try {
      const rooms = await this.transport.listRooms();
      if (this.mode === 'list') store.setRooms(rooms);
    } catch (error) {
      if (this.mode === 'list') store.setRoomsState('error', this.getErrorMessage(error));
    }
  }

  public async createRoom(input: CreateRoomInput): Promise<ChatRoom> {
    const normalized = {
      name: input.name.trim(),
      description: input.description.trim(),
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 5)
    };
    if (!normalized.name) throw new Error('请输入房间名');

    const room = await this.transport.createRoom(normalized);
    await this.loadRooms();
    return room;
  }

  public async sendTextMessage(text: string): Promise<boolean> {
    const content = text.trim();
    if (!content || !this.roomId) return false;
    const sent = await this.sendMessage({ type: 'text', content });
    if (sent) useSoulStore.getState().setInputText('');
    return sent;
  }

  public async sendEmoji(emoji: string): Promise<boolean> {
    return this.sendMessage({ type: 'text', content: emoji });
  }

  public async sendGif(url: string, name: string): Promise<boolean> {
    return this.sendMessage({
      type: 'gif',
      content: name,
      attachment: { url, name: `${name}.gif`, size: 0, mimeType: 'image/gif' }
    });
  }

  public async uploadAndSend(file: File): Promise<boolean> {
    const store = useSoulStore.getState();
    store.setChatError('');
    store.setIsUploading(true);
    try {
      const response = await fetch('/api/soul/upload', {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name)
        },
        body: file
      });
      const result = (await response.json()) as ChatAttachment & { error?: string };
      if (!response.ok) throw new Error(result.error || '上传失败');
      const type = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(result.mimeType) ? 'image' : 'file';
      return await this.sendMessage({ type, content: result.name, attachment: result });
    } catch (error) {
      store.setChatError(this.getErrorMessage(error));
      return false;
    } finally {
      store.setIsUploading(false);
    }
  }

  private async sendMessage(outgoing: OutgoingMessage): Promise<boolean> {
    if (!this.roomId) return false;
    const store = useSoulStore.getState();
    store.setChatError('');
    if (store.connectionState !== 'connected') {
      store.setChatError('聊天服务正在重连，请稍后再试');
      return false;
    }

    store.setIsSending(true);
    try {
      const message = await this.transport.sendMessage(this.roomId, outgoing);
      this.handleIncomingMessage(message);
      return true;
    } catch (error) {
      store.setChatError(this.getErrorMessage(error));
      return false;
    } finally {
      store.setIsSending(false);
    }
  }

  public async loadMoreHistory(): Promise<void> {
    const store = useSoulStore.getState();
    if (!this.roomId || !store.hasMoreHistory || store.isLoadingHistory) return;
    store.setIsLoadingHistory(true);

    try {
      const page = await this.transport.getHistory(this.roomId, store.historyBefore);
      const messages = this.toClientMessages(page.messages);
      store.mergeMessages(messages);
      store.setHistoryState(page.before, page.hasMore);
      this.cacheMessages(this.roomId, useSoulStore.getState().messages);
    } catch (error) {
      store.setChatError(this.getErrorMessage(error));
    } finally {
      store.setIsLoadingHistory(false);
    }
  }

  public copyMessage(messageId: string): void {
    const message = useSoulStore.getState().messages.find((item) => item.id === messageId);
    if (!message) return;
    void navigator.clipboard.writeText(message.content);
  }

  public downloadMessage(messageId: string): void {
    const message = useSoulStore.getState().messages.find((item) => item.id === messageId);
    if (!message) return;
    if (!message.attachment) return;
    void this.downloadAttachment(message.attachment);
  }

  private bindCommonEvents(): void {
    this.unsubscribers.push(
      this.transport.onConnectionChange((connected) => {
        useSoulStore.getState().setConnectionState(connected ? 'connected' : 'disconnected');
        if (!connected) return;
        if (this.mode === 'list') void this.loadRooms();
        if (this.mode === 'room') void this.rejoinRoom();
      }),
      this.transport.onRoomsChanged((rooms) => {
        if (this.mode === 'list') useSoulStore.getState().setRooms(rooms);
        if (this.mode === 'room') {
          const currentRoom = rooms.find((room) => room.id === this.roomId);
          if (currentRoom) useSoulStore.getState().setRoom(currentRoom);
        }
      })
    );
  }

  private async joinRoom(roomId: string): Promise<void> {
    if (!this.user) return;
    const result = await this.transport.joinRoom(roomId, this.user);
    if (this.mode !== 'room' || this.roomId !== roomId) return;
    const store = useSoulStore.getState();
    store.setRoom(result.room);
    store.mergeMessages(this.toClientMessages(result.messages));
    store.setHistoryState(result.before, result.hasMore);
    this.cacheMessages(roomId, useSoulStore.getState().messages);
  }

  private async rejoinRoom(): Promise<void> {
    if (this.mode !== 'room' || !this.roomId) return;
    try {
      await this.joinRoom(this.roomId);
    } catch (error) {
      useSoulStore.getState().setChatError(this.getErrorMessage(error));
    }
  }

  private handleIncomingMessage(message: ServerChatMessage): void {
    if (this.mode !== 'room' || message.roomId !== this.roomId) return;
    const clientMessage = this.toClientMessage(message);
    const store = useSoulStore.getState();
    store.mergeMessages([clientMessage]);
    this.cacheMessages(this.roomId, useSoulStore.getState().messages);
  }

  private toClientMessages(messages: ServerChatMessage[]): ChatMessage[] {
    return messages.map((message) => this.toClientMessage(message));
  }

  private toClientMessage(message: ServerChatMessage): ChatMessage {
    return { ...message, isLocal: message.senderId === this.user?.id };
  }

  private getOrCreateGuest(): ChatUser {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const user = JSON.parse(stored) as ChatUser;
        if (user.id && user.name) return user;
      }
    } catch {
      try {
        localStorage.removeItem(USER_STORAGE_KEY);
      } catch {
        // Continue with an in-memory guest when browser storage is unavailable.
      }
    }

    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = { id: `guest-${id}`, name: `星球旅人-${id.slice(0, 4).toUpperCase()}` };
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // The user can still chat for this page lifecycle without persistent storage.
    }
    return user;
  }

  private loadCachedMessages(roomId: string): ChatMessage[] {
    try {
      const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${roomId}`) || '[]') as ChatMessage[];
      return Array.isArray(cached) ? cached : [];
    } catch {
      return [];
    }
  }

  private cacheMessages(roomId: string, messages: ChatMessage[]): void {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${roomId}`, JSON.stringify(messages.slice(-CACHE_LIMIT)));
    } catch {
      // Storage can be unavailable in private browsing; the socket history remains authoritative.
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : '操作失败，请重试';
  }

  private async downloadAttachment(attachment: ChatAttachment): Promise<void> {
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error('下载失败');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      useSoulStore.getState().setChatError(this.getErrorMessage(error));
    }
  }
}

export const soulChat = new SoulChat();
export type { ChatMessage, ChatRoom, CreateRoomInput } from './types';
