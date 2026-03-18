import type { ChatRoom } from './types';

const NAMES = ['深空电台', '星际酒馆', '小行星观测站', '夜航船', '今日复盘', '灵感中继站', '白噪音', '猫与宇宙', '远方来信', '清晨播报', '程序员茶话会', '晚安电台'];
const DESCS = [
  '今天聊聊近况与计划。',
  '随便进来坐坐，聊聊你最近在想什么。',
  '专注工作/学习，偶尔打卡互相鼓励。',
  '如果你也在路上，我们可以交换故事。',
  '记录今天的小胜利和小挫折。',
  '收集碎片灵感，拼成明天。',
  '一句话也不说也没关系。',
  '分享你看到的好东西。',
  '把想说的话留在这里。',
  '简单问候，慢慢熟悉。'
];

function pick<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}

export function createMockRooms(count: number): ChatRoom[] {
  const total = Math.max(0, Math.min(20, count));
  return Array.from({ length: total }, (_, i) => {
    const longName = i % 7 === 0 ? `${pick(NAMES, i)} · ${pick(NAMES, i + 1)} Special` : pick(NAMES, i);
    const desc = i % 5 === 0 ? `${pick(DESCS, i)} ${pick(DESCS, i + 2)}` : pick(DESCS, i);

    return {
      id: `room_${i + 1}`,
      name: longName,
      description: i % 9 === 0 ? undefined : desc,
      onlineCount: 2 + ((i * 7) % 97),
      status: 'online'
    };
  });
}

