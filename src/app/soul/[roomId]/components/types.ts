export type { ChatMessage, MessageType } from '../../core/types';

export function getAvatarUrl(userId: string, avatarUrl = '', publicKey = ''): string {
  return avatarUrl || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(publicKey || userId)}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameDay ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
