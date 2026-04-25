'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './types';
import { getAvatarUrl, formatTime } from './types';
import { MessageActions } from './MessageActions';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isLocal = message.isLocal;
  const avatarUrl = getAvatarUrl(message.senderId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('touchstart', close, true);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('touchstart', close, true);
    };
  }, [actionsOpen]);

  const toggleFromBubble = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionsOpen((v) => !v);
  };

  return (
    <div
      ref={rowRef}
      className={`flex gap-2 py-1 ${isLocal ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <img
        src={avatarUrl}
        alt={message.senderName}
        className="w-8 h-8 rounded-full shrink-0 bg-surface-hover mt-1"
      />

      <div className={`flex flex-col min-w-0 ${isLocal ? 'items-end' : 'items-start'}`}>
        {isLocal ? (
          <div className="flex items-center justify-end gap-1 mb-1">
            <span className="text-xs text-foreground-muted">{formatTime(message.timestamp)}</span>
            <span className="text-foreground-muted text-xs">·</span>
            <span className="text-sm font-medium text-foreground">{message.senderName}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-sm font-medium text-foreground">{message.senderName}</span>
            <span className="text-foreground-muted text-xs">·</span>
            <span className="text-xs text-foreground-muted">{formatTime(message.timestamp)}</span>
          </div>
        )}

        <div className="relative flex items-center gap-1">
          <div
            role="button"
            tabIndex={0}
            onClick={toggleFromBubble}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActionsOpen((v) => !v);
              }
            }}
            className={`cursor-pointer select-text rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
              isLocal
                ? 'bg-chat-self text-chat-self-foreground order-2'
                : 'bg-chat-other text-chat-other-foreground order-1'
            }`}
            style={{ maxWidth: '70%' }}
          >
            {message.content}
          </div>

          <div className={isLocal ? 'order-1' : 'order-2'}>
            <MessageActions
              messageId={message.id}
              position={isLocal ? 'left' : 'right'}
              visible={actionsOpen}
              onRequestClose={() => setActionsOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
