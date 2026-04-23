import type { ChatMessage } from './types';

const LOCAL_USER = { id: 'local_user_1', name: '我' };

const REMOTE_USERS = [
  { id: 'remote_001', name: '星际旅人' },
  { id: 'remote_002', name: '深海鱼' },
  { id: 'remote_003', name: '月球邮递员' }
];

const MESSAGES: Array<{ text: string; isLocal: boolean; userIdx?: number }> = [
  { text: '大家好，今天天气不错', isLocal: false, userIdx: 0 },
  { text: '是啊，适合出门走走', isLocal: true },
  { text: '有人想一起去爬山吗？', isLocal: false, userIdx: 1 },
  { text: '我感兴趣！什么时候出发？', isLocal: true },
  { text: '周末怎么样？早上 8 点集合', isLocal: false, userIdx: 1 },
  { text: '可以，我到时候带点水果', isLocal: true },
  { text: '我也来，带上相机记录一下', isLocal: false, userIdx: 2 },
  { text: '太好了，人多热闹', isLocal: false, userIdx: 0 },
  { text: '那就这么定了，周末见！', isLocal: true },
  { text: '记得穿运动鞋哦', isLocal: false, userIdx: 2 },
  { text: '好的，还有什么需要准备的吗？', isLocal: true },
  { text: '带个小背包就行，轻装上阵', isLocal: false, userIdx: 1 }
];

export function createMockMessages(roomId: string): ChatMessage[] {
  const baseTime = Date.now() - MESSAGES.length * 60_000;

  return MESSAGES.map((m, i) => {
    const user = m.isLocal ? LOCAL_USER : REMOTE_USERS[m.userIdx ?? 0];

    return {
      id: `msg_${roomId}_${i}`,
      roomId,
      senderId: user.id,
      senderName: user.name,
      type: 'text' as const,
      content: m.text,
      timestamp: baseTime + i * 60_000 + Math.floor(Math.random() * 30_000),
      isLocal: m.isLocal
    };
  });
}
