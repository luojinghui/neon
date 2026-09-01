import { useSoulStore } from '../store';
import { SocketChatError, SocketChatTransport } from './socketTransport';
import type {
  ChatAttachment,
  ChatMessage,
  ChatRoom,
  ChatUser,
  CreateRoomInput,
  OutgoingMessage,
  ServerChatMessage,
  UpdateRoomInput
} from './types';

const USER_STORAGE_KEY = 'soul:guest-user';
const CACHE_PREFIX = 'soul:room-cache:';
const CACHE_LIMIT = 100;

type CoreMode = 'list' | 'room' | null;

export class SoulChat {
  private readonly transport = new SocketChatTransport();
  private user: ChatUser | null = null;
  private mode: CoreMode = null;
  private roomId = '';
  private roomPassword = '';
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
      await this.transport.connect(this.user);
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
    this.roomPassword = '';
    this.user = this.getOrCreateGuest();
    const store = useSoulStore.getState();
    store.prepareRoom(roomId);
    store.setConnectionState('connecting');
    try {
      await this.transport.connect(this.user);
      if (sessionId !== this.sessionId || this.mode !== 'room' || this.roomId !== roomId) return;
      this.bindCommonEvents();
      this.bindRoomEvents();
      store.setConnectionState('connected');
      await this.joinRoom(roomId);
    } catch (error) {
      if (sessionId !== this.sessionId || this.mode !== 'room' || this.roomId !== roomId) return;
      this.handleJoinError(error);
    }
  }

  public destroy(): void {
    this.sessionId += 1;
    this.mode = null;
    this.roomId = '';
    this.roomPassword = '';
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.transport.leaveRoom().catch(() => undefined);
    this.transport.disconnect();
    useSoulStore.getState().reset();
  }

  public async loadRooms(silent = false): Promise<void> {
    const store = useSoulStore.getState();
    if (!silent) store.setRoomsState('loading');
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
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 5),
      isPrivate: input.isPrivate === true,
      passwordEnabled: input.passwordEnabled === true,
      password: input.password?.trim() || ''
    };
    if (!normalized.name) throw new Error('请输入星球名');
    this.validatePassword(normalized.passwordEnabled, normalized.password);

    const room = await this.transport.createRoom(normalized);
    await this.loadRooms(true);
    return room;
  }

  public async updateRoom(input: UpdateRoomInput): Promise<ChatRoom> {
    const normalized = {
      roomId: input.roomId,
      name: input.name.trim(),
      description: input.description.trim(),
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 5),
      isPrivate: input.isPrivate === true,
      passwordEnabled: input.passwordEnabled === true,
      password: input.password?.trim() || ''
    };
    if (!normalized.name) throw new Error('请输入星球名');
    this.validatePassword(normalized.passwordEnabled, normalized.password, true);
    const room = await this.transport.updateRoom(normalized);
    await this.loadRooms(true);
    return room;
  }

  public async deleteRoom(roomId: string): Promise<void> {
    await this.transport.deleteRoom(roomId);
    this.removeRoomCache(roomId);
    await this.loadRooms(true);
  }

  public async searchRoom(query: string): Promise<ChatRoom | null> {
    const roomId = query.trim();
    if (!roomId) throw new Error('请输入星球 ID');
    return this.transport.searchRoom(roomId);
  }

  public async submitRoomPassword(password: string): Promise<boolean> {
    const normalized = password.trim();
    this.validatePassword(true, normalized);
    this.roomPassword = normalized;
    useSoulStore.getState().setAccessState('joining');
    try {
      await this.joinRoom(this.roomId);
      return true;
    } catch (error) {
      this.handleJoinError(error);
      return false;
    }
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

  public async deleteMessage(messageId: string): Promise<boolean> {
    if (!this.roomId || !messageId) return false;
    const store = useSoulStore.getState();
    store.setChatError('');
    try {
      await this.transport.deleteMessage(this.roomId, messageId);
      this.handleDeletedMessage(this.roomId, messageId);
      return true;
    } catch (error) {
      store.setChatError(this.getErrorMessage(error));
      return false;
    }
  }

  private bindCommonEvents(): void {
    this.unsubscribers.push(
      this.transport.onConnectionChange((connected) => {
        useSoulStore.getState().setConnectionState(connected ? 'connected' : 'disconnected');
        if (!connected) return;
        if (this.mode === 'list') void this.loadRooms();
        if (this.mode === 'room') void this.rejoinRoom();
      }),
      this.transport.onRoomsChanged(() => {
        if (this.mode === 'list') void this.loadRooms(true);
      })
    );
  }

  private bindRoomEvents(): void {
    this.unsubscribers.push(
      this.transport.onMessage((message) => this.handleIncomingMessage(message)),
      this.transport.onMessageDeleted((event) => this.handleDeletedMessage(event.roomId, event.messageId)),
      this.transport.onRoomUpdated((room) => {
        if (this.mode === 'room' && room.id === this.roomId) useSoulStore.getState().setRoom(room);
      }),
      this.transport.onRoomDeleted((event) => {
        if (this.mode !== 'room' || event.roomId !== this.roomId) return;
        this.removeRoomCache(event.roomId);
        const store = useSoulStore.getState();
        store.setMessages([]);
        store.setRoom(null);
        store.setAccessState('deleted', '星球已被创建者删除');
      })
    );
  }

  private async joinRoom(roomId: string): Promise<void> {
    if (!this.user) return;
    const result = await this.transport.joinRoom(roomId, this.roomPassword);
    if (this.mode !== 'room' || this.roomId !== roomId) return;
    const store = useSoulStore.getState();
    store.setRoom(result.room);
    store.setMessages(this.toClientMessages(result.messages));
    store.setHistoryState(result.before, result.hasMore);
    store.setAccessState('granted');
    this.cacheMessages(roomId, useSoulStore.getState().messages);
  }

  private async rejoinRoom(): Promise<void> {
    if (this.mode !== 'room' || !this.roomId) return;
    try {
      await this.joinRoom(this.roomId);
    } catch (error) {
      this.handleJoinError(error);
    }
  }

  private handleIncomingMessage(message: ServerChatMessage): void {
    if (this.mode !== 'room' || message.roomId !== this.roomId) return;
    const clientMessage = this.toClientMessage(message);
    const store = useSoulStore.getState();
    store.mergeMessages([clientMessage]);
    this.cacheMessages(this.roomId, useSoulStore.getState().messages);
  }

  private handleDeletedMessage(roomId: string, messageId: string): void {
    if (this.mode !== 'room' || roomId !== this.roomId) return;
    const store = useSoulStore.getState();
    store.removeMessage(messageId);
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

  private cacheMessages(roomId: string, messages: ChatMessage[]): void {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${roomId}`, JSON.stringify(messages.slice(-CACHE_LIMIT)));
    } catch {
      // Storage can be unavailable in private browsing; the socket history remains authoritative.
    }
  }

  private removeRoomCache(roomId: string): void {
    try {
      localStorage.removeItem(`${CACHE_PREFIX}${roomId}`);
    } catch {
      // The server remains authoritative when browser storage is unavailable.
    }
  }

  private handleJoinError(error: unknown): void {
    const store = useSoulStore.getState();
    const message = this.getErrorMessage(error);
    if (error instanceof SocketChatError && ['ROOM_PASSWORD_REQUIRED', 'ROOM_PASSWORD_INVALID'].includes(error.code)) {
      this.roomPassword = '';
      store.setAccessState('password-required', error.code === 'ROOM_PASSWORD_INVALID' ? message : '');
      return;
    }
    store.setAccessState('error', message);
    store.setChatError(message);
  }

  private validatePassword(enabled: boolean, password: string, allowBlank = false): void {
    if (!enabled) return;
    if (allowBlank && !password) return;
    if (!/^[A-Za-z0-9]{2,4}$/.test(password)) throw new Error('密码必须是 2-4 位数字或字母');
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
export type { ChatMessage, ChatRoom, CreateRoomInput, UpdateRoomInput } from './types';
