import { useSoulStore } from '../store';
import { createMockMessages } from '../[roomId]/components/mock';
import type { ChatMessage } from '../[roomId]/components/types';
import { MessageInstance } from 'antd/es/message/interface';

export class SoulChat {
  private _message: MessageInstance | null = null;
  private _localUserId = 'local_user_1';
  private _localUserName = '我';

  public setMessage(message: MessageInstance): void {
    this._message = message;
  }

  public init(roomId: string): void {
    const store = useSoulStore.getState();
    store.setRoomId(roomId);
    store.setRoomName(this.getRoomDisplayName(roomId));

    const messages = createMockMessages(roomId);
    store.setMessages(messages);
  }

  public destroy(): void {
    useSoulStore.getState().reset();
  }

  public sendTextMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const store = useSoulStore.getState();
    const msg: ChatMessage = {
      id: `msg_${store.roomId}_${Date.now()}`,
      roomId: store.roomId,
      senderId: this._localUserId,
      senderName: this._localUserName,
      type: 'text',
      content: trimmed,
      timestamp: Date.now(),
      isLocal: true
    };

    store.addMessage(msg);
    store.setInputText('');
  }

  public copyMessage(messageId: string): void {
    const msg = useSoulStore.getState().messages.find((m) => m.id === messageId);
    if (!msg) return;

    navigator.clipboard.writeText(msg.content);
    this._message?.success('已复制');
  }

  public downloadMessage(messageId: string): void {
    const msg = useSoulStore.getState().messages.find((m) => m.id === messageId);
    if (!msg) return;

    const blob = new Blob([msg.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-${messageId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    this._message?.success('已下载');
  }

  public showMoreActions(): void {
    this._message?.info('开发中');
  }

  public showToolbarPlaceholder(): void {
    this._message?.info('开发中');
  }

  private getRoomDisplayName(roomId: string): string {
    const names: Record<string, string> = {
      room_1: '深空电台',
      room_2: '星际酒馆',
      room_3: '小行星观测站',
      room_4: '夜航船',
      room_5: '今日复盘',
      room_6: '灵感中继站',
      room_7: '白噪音',
      room_8: '猫与宇宙'
    };
    return names[roomId] || `聊天室 ${roomId}`;
  }
}

export const soulChat = new SoulChat();
