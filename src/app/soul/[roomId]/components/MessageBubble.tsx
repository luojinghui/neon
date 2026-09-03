'use client';

import { FileOutlined } from '@ant-design/icons';
import { Image as PreviewImage } from 'antd';
import NextImage from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
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

function getFileType(name = '', mimeType = ''): string {
  const extension = name.split('.').pop()?.trim().toUpperCase();
  if (extension && extension !== name.toUpperCase()) return extension;
  const subtype = mimeType.split('/').pop()?.split(/[.+-]/)[0]?.trim().toUpperCase();
  return subtype || '文件';
}

function MessageContent({
  message,
  onPreviewFile
}: {
  message: ChatMessage;
  onPreviewFile: () => void;
}) {
  if (message.type === 'image' || message.type === 'gif') {
    const url = message.attachment?.url || message.content;
    return (
      <PreviewImage
        src={url}
        alt={message.attachment?.name || message.content || '图片'}
        draggable={false}
        preview={{
          cover: false
        }}
        classNames={{ root: 'soul-message-image max-w-[min(280px,70vw)] overflow-hidden rounded-xl', popup: { root: 'soul-image-preview' } }}
        className="block max-h-72 w-auto max-w-full rounded-xl object-contain"
        fallback="/source/index.png"
      />
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
          <div className="mt-0.5 text-xs text-foreground-muted">
            {getFileType(message.attachment?.name || message.content, message.attachment?.mimeType)} · {formatFileSize(message.attachment?.size)}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`soul-message-content inline-block max-w-[min(680px,100%)] overflow-hidden whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-base leading-relaxed ${
        message.isLocal ? 'bg-chat-self text-chat-self-foreground' : 'bg-chat-other text-chat-other-foreground'
      }`}
    >
      {message.content}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isLocal = message.isLocal;
  const avatarUrl = getAvatarUrl(message.senderId, message.senderAvatar, message.senderKey);
  const profileHref = createProfileHref(message.senderId, { publicKey: message.senderKey, returnTo: `/soul/${message.roomId}` });
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);

  return (
    <article className={`flex w-full gap-2 py-2 ${isLocal ? 'flex-row-reverse' : 'flex-row'}`}>
      <Link href={profileHref} className="h-8 w-8 shrink-0 rounded-full outline-none ring-primary/30 transition hover:ring-2 focus-visible:ring-2" aria-label={`查看${message.senderName}的个人主页`}>
        <NextImage src={avatarUrl} alt={message.senderName} width={32} height={32} unoptimized draggable={false} className="h-8 w-8 rounded-full bg-surface-hover object-cover" />
      </Link>

      <div className={`flex min-w-0 max-w-[85%] flex-col ${isLocal ? 'items-end' : 'items-start'}`}>
        <div className={`flex max-w-full items-center gap-1.5 leading-none ${isLocal ? 'flex-row-reverse' : ''}`}>
          <Link href={profileHref} className="max-w-[min(52vw,320px)] truncate rounded-sm text-sm font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30">
            {message.senderName}
          </Link>
          <span className="text-xs text-foreground-muted">·</span>
          <time className="whitespace-nowrap text-xs text-foreground-muted" dateTime={new Date(message.timestamp).toISOString()}>
            {formatTime(message.timestamp)}
          </time>
        </div>

        <div className={`mt-1.5 flex max-w-full items-start gap-1 ${isLocal ? 'flex-row-reverse' : 'flex-row'}`}>
          <MessageContent message={message} onPreviewFile={() => setFilePreviewOpen(true)} />
          <MessageActions messageId={message.id} messageType={message.type} hasAttachment={Boolean(message.attachment)} />
        </div>
      </div>

      {message.type === 'file' && (
        <FilePreviewModal attachment={message.attachment} open={filePreviewOpen} onClose={() => setFilePreviewOpen(false)} />
      )}
    </article>
  );
}
