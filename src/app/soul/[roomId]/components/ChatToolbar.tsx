'use client';

import { Button } from '@/components/ui/button';
import { BarChartOutlined, FileImageOutlined, LoadingOutlined, PaperClipOutlined, SmileOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import { EmojiPicker } from './EmojiPicker';
import { GameLauncher } from './GameLauncher';
import { PollCreateModal } from './PollCreateModal';
import { RoomCallButtons } from './RoomCall';
import { chatToolbarButtonClass as buttonClass } from './toolbarStyles';

export function ChatToolbar() {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = useSoulStore((state) => state.isUploading);
  const chatError = useSoulStore((state) => state.chatError);
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const canAccess = useSoulStore((state) => state.accessState === 'granted');
  const isSending = useSoulStore((state) => state.isSending);
  const direct = useSoulStore((state) => state.room?.kind === 'direct');

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void soulChat.uploadAndSend(file);
  };

  return (
    <div className="relative mt-1 flex min-h-8 items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" iconOnly type="button" onClick={() => setEmojiOpen((open) => !open)} disabled={!connected} className={buttonClass} aria-label="表情">
          <SmileOutlined className="text-base" />
        </Button>
        <Button variant="ghost" iconOnly type="button" onClick={() => imageInputRef.current?.click()} disabled={!connected || isUploading} className={buttonClass} aria-label="图片">
          <FileImageOutlined className="text-base" />
        </Button>
        <Button variant="ghost" iconOnly type="button" onClick={() => fileInputRef.current?.click()} disabled={!connected || isUploading} className={buttonClass} aria-label="文件">
          <PaperClipOutlined className="text-base" />
        </Button>

        {!direct && <><span className="w-1" aria-hidden />
        <Button size="sm" variant="ghost" type="button" onClick={() => setPollOpen(true)} disabled={!connected || !canAccess || isSending} aria-label="发起投票" title="发起投票" className="inline-flex h-8 items-center justify-center gap-1.5 px-2 text-xs"><BarChartOutlined className="text-base" /><span className="hidden sm:inline">投票</span></Button>
        <GameLauncher />
        <RoomCallButtons /></>}

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
      {pollOpen && <PollCreateModal onClose={() => setPollOpen(false)} />}
    </div>
  );
}
