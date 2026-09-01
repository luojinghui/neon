'use client';

import { Image } from 'antd';
import { useEffect, useRef } from 'react';
import { soulChat } from '../../core';

const EMOJIS = [
  '😀',
  '😄',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😘',
  '😋',
  '😎',
  '🥳',
  '🤔',
  '🤗',
  '🤭',
  '😭',
  '😡',
  '😱',
  '🤩',
  '🫡',
  '👍',
  '👏',
  '🙌',
  '🤝',
  '💪',
  '🙏',
  '👋',
  '🫶',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🔥',
  '✨',
  '🎉',
  '🚀',
  '🌟',
  '💡'
];

const ANIMATED_EMOJIS = [
  { code: '1f44b', name: '挥手' },
  { code: '1f602', name: '笑哭' },
  { code: '1f60d', name: '喜欢' },
  { code: '1f973', name: '庆祝' },
  { code: '1f44d', name: '点赞' },
  { code: '1f525', name: '火热' },
  { code: '1f680', name: '出发' },
  { code: '1f914', name: '思考' }
].map((item) => ({ ...item, url: `https://fonts.gstatic.com/s/e/notoemoji/latest/${item.code}/512.gif` }));

export function EmojiPicker({ onClose }: { onClose: () => void }) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent | TouchEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('touchstart', close, true);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('touchstart', close, true);
    };
  }, [onClose]);

  return (
    <div ref={pickerRef} className="absolute bottom-11 left-0 z-20 w-[min(320px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-3 shadow-xl">
      <div className="text-xs font-medium text-foreground-secondary">常用 Emoji</div>
      <div className="mt-2 grid grid-cols-8 gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              void soulChat.sendEmoji(emoji);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition-colors hover:bg-surface-active"
            aria-label={`发送 ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3 text-xs font-medium text-foreground-secondary">动态表情</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {ANIMATED_EMOJIS.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => {
              void soulChat.sendGif(item.url, item.name);
              onClose();
            }}
            className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-background-secondary p-1 transition-colors hover:bg-surface-active"
            aria-label={`发送动态表情：${item.name}`}
          >
            <Image src={item.url} alt={item.name} preview={false} className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
}
