'use client';

import { FileImageOutlined, LoadingOutlined, PaperClipOutlined, SmileOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import { EmojiPicker } from './EmojiPicker';

const buttonClass = 'flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-active hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';

export function ChatToolbar() {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = useSoulStore((state) => state.isUploading);
  const chatError = useSoulStore((state) => state.chatError);
  const connected = useSoulStore((state) => state.connectionState === 'connected');

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void soulChat.uploadAndSend(file);
  };

  return (
    <div className="relative mt-2 flex min-h-8 items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setEmojiOpen((open) => !open)} disabled={!connected} className={buttonClass} aria-label="表情">
          <SmileOutlined className="text-base" />
        </button>
        <button type="button" onClick={() => imageInputRef.current?.click()} disabled={!connected || isUploading} className={buttonClass} aria-label="图片">
          <FileImageOutlined className="text-base" />
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!connected || isUploading} className={buttonClass} aria-label="文件">
          <PaperClipOutlined className="text-base" />
        </button>

        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} className="hidden" />
        <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />
      </div>

      <div className="min-w-0 text-right text-xs">
        {isUploading ? (
          <span className="inline-flex items-center gap-1 text-foreground-muted">
            <LoadingOutlined /> 正在上传…
          </span>
        ) : chatError ? (
          <span className="line-clamp-1 text-danger">{chatError}</span>
        ) : null}
      </div>

      {emojiOpen && <EmojiPicker onClose={() => setEmojiOpen(false)} />}
    </div>
  );
}
