'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSoulStore } from '../../store';
import { MessageBubble } from './MessageBubble';

const SCROLL_THRESHOLD = 100;

type MessageListProps = {
  className?: string;
};

export function MessageList({ className = '' }: MessageListProps) {
  const messages = useSoulStore((s) => s.messages);
  const hasNewMessage = useSoulStore((s) => s.hasNewMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    useSoulStore.getState().setHasNewMessage(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= SCROLL_THRESHOLD;

    if (isNearBottomRef.current) {
      useSoulStore.getState().setHasNewMessage(false);
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;

    if (messages.length !== prevCountRef.current) {
      if (isNearBottomRef.current) {
        scrollToBottom(prevCountRef.current > 0);
      } else if (messages.length > prevCountRef.current) {
        useSoulStore.getState().setHasNewMessage(true);
      }
      prevCountRef.current = messages.length;
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={containerRef} className={`h-full overflow-y-auto pb-4 ${className}`} onScroll={handleScroll}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {hasNewMessage && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg
                     bg-primary text-white text-xs font-medium shadow-md
                     hover:bg-primary-hover transition-colors animate-in slide-in-from-bottom-2 duration-200"
        >
          新消息
        </button>
      )}
    </div>
  );
}
