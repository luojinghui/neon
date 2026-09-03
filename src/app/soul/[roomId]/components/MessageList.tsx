'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';
import { MessageBubble } from './MessageBubble';

const SCROLL_THRESHOLD = 100;

type MessageListProps = {
  className?: string;
};

export function MessageList({ className = '' }: MessageListProps) {
  const messages = useSoulStore((s) => s.messages);
  const hasNewMessage = useSoulStore((s) => s.hasNewMessage);
  const hasMoreHistory = useSoulStore((s) => s.hasMoreHistory);
  const isLoadingHistory = useSoulStore((s) => s.isLoadingHistory);
  const connectionState = useSoulStore((s) => s.connectionState);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);
  const isNearBottomRef = useRef(true);
  const isRestoringHistoryRef = useRef(false);

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

  const handleLoadMore = useCallback(async () => {
    const el = containerRef.current;
    const previousHeight = el?.scrollHeight || 0;
    isRestoringHistoryRef.current = true;
    await soulChat.loadMoreHistory();
    window.requestAnimationFrame(() => {
      if (el && containerRef.current === el) {
        el.scrollTop += el.scrollHeight - previousHeight;
      }
      useSoulStore.getState().setHasNewMessage(false);
      window.requestAnimationFrame(() => {
        isRestoringHistoryRef.current = false;
        handleScroll();
      });
    });
  }, [handleScroll]);

  useEffect(() => {
    if (messages.length === 0) return;

    if (messages.length !== prevCountRef.current) {
      if (isRestoringHistoryRef.current) {
        prevCountRef.current = messages.length;
        return;
      }

      if (isNearBottomRef.current) {
        scrollToBottom(false);
      } else if (messages.length > prevCountRef.current) {
        useSoulStore.getState().setHasNewMessage(true);
      }
      prevCountRef.current = messages.length;
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!isNearBottomRef.current || isRestoringHistoryRef.current) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (isNearBottomRef.current && !isRestoringHistoryRef.current) {
          scrollToBottom(false);
        }
      });
    });

    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [scrollToBottom]);

  return (
    <div className="relative w-full flex-1 overflow-hidden">
      <div ref={containerRef} className="chat-scrollbar h-full overflow-y-auto" onScroll={handleScroll}>
        <div ref={contentRef} className={`mx-auto flex min-h-full w-full max-w-[1312px] flex-col justify-end px-4 pb-4 ${className}`}>
          {hasMoreHistory && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingHistory || connectionState !== 'connected'}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingHistory ? '加载中...' : '加载更早消息'}
              </button>
            </div>
          )}
          {messages.length === 0 && connectionState === 'connected' && (
            <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
              <div className="text-sm font-medium text-foreground">这里还很安静</div>
              <div className="mt-1 text-xs text-foreground-muted">发送第一条消息，开启这个星球的话题。</div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
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
