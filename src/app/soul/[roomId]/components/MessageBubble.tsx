'use client';

import { FileOutlined } from '@ant-design/icons';
import { Image as PreviewImage } from 'antd';
import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './types';
import { formatTime, getAvatarUrl } from './types';
import { MessageActions } from './MessageActions';
import { FilePreviewModal } from './FilePreviewModal';

function formatFileSize(size = 0): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function MessageContent({
  message,
  onToggleActions,
  onPreviewFile
}: {
  message: ChatMessage;
  onToggleActions: (event: React.SyntheticEvent) => void;
  onPreviewFile: () => void;
}) {
  if (message.type === 'image' || message.type === 'gif') {
    const url = message.attachment?.url || message.content;
    return (
      <div className="soul-message-image max-w-[min(280px,70vw)]">
        <PreviewImage
          src={url}
          alt={message.attachment?.name || message.content || '图片'}
          draggable={false}
          preview={{ mask: null }}
          classNames={{ popup: { root: 'soul-image-preview' } }}
          className="block max-h-72 w-auto max-w-full object-contain"
          fallback="/source/index.png"
        />
      </div>
    );
  }

  if (message.type === 'file') {
    return (
      <button
        type="button"
        onClick={onPreviewFile}
        className="flex max-w-[min(300px,72vw)] items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-surface-hover"
        aria-label={`预览 ${message.attachment?.name || message.content}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <FileOutlined className="text-lg" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{message.attachment?.name || message.content}</div>
          <div className="mt-0.5 text-xs text-foreground-muted">{formatFileSize(message.attachment?.size)}</div>
        </div>
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleActions}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleActions(event);
        }
      }}
      className={`soul-message-content max-w-[min(560px,70vw)] cursor-pointer overflow-hidden whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-base leading-relaxed ${
        message.isLocal ? 'bg-chat-self text-chat-self-foreground' : 'bg-chat-other text-chat-other-foreground'
      }`}
    >
      {message.content}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isLocal = message.isLocal;
  const avatarUrl = getAvatarUrl(message.senderId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const isAttachment = message.type === 'image' || message.type === 'gif' || message.type === 'file';

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (rowRef.current && !rowRef.current.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener('mousedown', close, true);
    document.addEventListener('touchstart', close, true);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('touchstart', close, true);
    };
  }, [actionsOpen]);

  const toggleFromBubble = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    setActionsOpen((open) => !open);
  };

  return (
    <div ref={rowRef} className={`flex gap-2 py-1.5 ${isLocal ? 'flex-row-reverse' : 'flex-row'}`}>
      <NextImage src={avatarUrl} alt={message.senderName} width={32} height={32} unoptimized draggable={false} className="mt-1 h-8 w-8 shrink-0 rounded-full bg-surface-hover" />

      <div className={`flex min-w-0 max-w-[85%] flex-col ${isLocal ? 'items-end' : 'items-start'}`}>
        <div className={`mb-1 flex items-center gap-1 ${isLocal ? 'flex-row-reverse justify-end' : ''}`}>
          <span className="text-sm font-medium text-foreground">{message.senderName}</span>
          <span className="text-xs text-foreground-muted">·</span>
          <span className="text-xs text-foreground-muted">{formatTime(message.timestamp)}</span>
        </div>

        <div className="relative flex items-center gap-1">
          <div className={isLocal ? 'order-2' : 'order-1'}>
            <MessageContent message={message} onToggleActions={toggleFromBubble} onPreviewFile={() => setFilePreviewOpen(true)} />
          </div>
          <div className={isLocal ? 'order-1' : 'order-2'}>
            <MessageActions
              messageId={message.id}
              messageType={message.type}
              visible={isAttachment || actionsOpen}
              onRequestClose={() => setActionsOpen(false)}
            />
          </div>
        </div>
      </div>

      {message.type === 'file' && <FilePreviewModal attachment={message.attachment} open={filePreviewOpen} onClose={() => setFilePreviewOpen(false)} />}
    </div>
  );
}
