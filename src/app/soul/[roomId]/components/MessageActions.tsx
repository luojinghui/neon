'use client';

import { CopyOutlined, DownloadOutlined, EllipsisOutlined } from '@ant-design/icons';
import { soulChat } from '../../core';

interface MessageActionsProps {
  messageId: string;
  position: 'left' | 'right';
}

export function MessageActions({ messageId, position }: MessageActionsProps) {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.copyMessage(messageId);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.downloadMessage(messageId);
  };

  const handleMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.showMoreActions();
  };

  const btnClass = 'w-7 h-7 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-active transition-colors';

  return (
    <div
      className={`flex items-center gap-0.5 opacity-0 pointer-events-none
                   group-hover:opacity-100 group-hover:pointer-events-auto
                   transition-opacity duration-150
                   ${position === 'left' ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <button type="button" className={btnClass} onClick={handleCopy} aria-label="复制">
        <CopyOutlined className="text-xs" />
      </button>
      <button type="button" className={btnClass} onClick={handleDownload} aria-label="下载">
        <DownloadOutlined className="text-xs" />
      </button>
      <button type="button" className={btnClass} onClick={handleMore} aria-label="更多">
        <EllipsisOutlined className="text-xs" />
      </button>
    </div>
  );
}
