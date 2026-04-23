export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'link' | 'markdown' | 'music';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: MessageType;
  content: string;
  timestamp: number;
  isLocal: boolean;
}

export function getAvatarUrl(userId: string): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(userId)}`;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
