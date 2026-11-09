'use client';

import { Button } from '@/components/ui/button';
import { message as toast } from '@/components/ui/message';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { ImageViewer } from '@/components/image-viewer/ImageViewer';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';
import { MessageBubble } from './MessageBubble';

const SCROLL_THRESHOLD = 100;

type MessageListProps = {
  className?: string;
};

export function MessageList({ className = '' }: MessageListProps) {
  const messages = useSoulStore((s) => s.messages);
  const direct = useSoulStore((s) => s.room?.kind === 'direct');
  const hasNewMessage = useSoulStore((s) => s.hasNewMessage);
  const hasMoreHistory = useSoulStore((s) => s.hasMoreHistory);
  const isLoadingHistory = useSoulStore((s) => s.isLoadingHistory);
  const connectionState = useSoulStore((s) => s.connectionState);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);
  const isNearBottomRef = useRef(true);
  const isRestoringHistoryRef = useRef(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const images = useMemo(() => messages.filter((message) => message.type === 'image').map((message) => ({ id: message.id, url: message.attachment?.url || message.content, name: message.attachment?.name || '聊天图片' })), [messages]);
  const previewIndex = images.findIndex((image) => image.id === previewId);

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
      void soulChat.markDirectRead();
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

  const jumpToMessageId = useSoulStore((s) => s.jumpToMessageId);
  useEffect(() => {
    if (!jumpToMessageId) return;
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        const target = document.getElementById(`msg-${jumpToMessageId}`);
        if (target) {
          isNearBottomRef.current = false;
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.add('soul-message-highlight');
          window.setTimeout(() => target.classList.remove('soul-message-highlight'), 1800);
          return;
        }
        const state = useSoulStore.getState();
        if (!state.hasMoreHistory) break;
        isRestoringHistoryRef.current = true;
        await soulChat.loadMoreHistory();
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
        isRestoringHistoryRef.current = false;
      }
      if (!cancelled) toast.info('消息较早，请上滑查看');
    };
    void run().finally(() => { if (!cancelled) useSoulStore.getState().setJumpToMessageId(''); });
    return () => { cancelled = true; };
  }, [jumpToMessageId]);

  useEffect(() => {
    const read = () => { if (isNearBottomRef.current) void soulChat.markDirectRead(); };
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, [messages, connectionState]);

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
        <div ref={contentRef} className={`app-content-width flex min-h-full flex-col justify-end pb-4 ${className}`}>
          {hasMoreHistory && (
            <div className="flex justify-center pb-4">
              <Button size="sm" variant="outline"
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingHistory || connectionState !== 'connected'}
                className="px-3 py-1.5 text-xs font-medium"
              >
                {isLoadingHistory ? '加载中...' : '加载更早消息'}
              </Button>
            </div>
          )}
          {messages.length === 0 && connectionState === 'connected' && (
            <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
              <div className="text-sm font-medium text-foreground">这里还很安静</div>
              <div className="mt-1 text-xs text-foreground-muted">{direct ? '发送第一条私信，和对方打个招呼。' : '发送第一条消息，开启这个星球的话题。'}</div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} onPreviewImage={() => setPreviewId(msg.id)} />
          ))}
        </div>
      </div>

      {previewIndex >= 0 && <ImageViewer images={images} currentIndex={previewIndex} onSelect={setPreviewId} onClose={() => setPreviewId(null)} title="聊天图片" />}

      {hasNewMessage && (
        <Button size="sm" variant="primary"
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium slide-in-from-bottom-2"
        >
          新消息
        </Button>
      )}
    </div>
  );
}
