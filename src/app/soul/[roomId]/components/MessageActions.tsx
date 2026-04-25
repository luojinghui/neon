'use client';

import { CopyOutlined, DownloadOutlined, EllipsisOutlined } from '@ant-design/icons';
import { soulChat } from '../../core';

interface MessageActionsProps {
  messageId: string;
  position: 'left' | 'right';
  visible: boolean;
  onRequestClose?: () => void;
}

export function MessageActions({ messageId, position, visible, onRequestClose }: MessageActionsProps) {
  const runClose = () => onRequestClose?.();

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.copyMessage(messageId);
    runClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.downloadMessage(messageId);
    runClose();
  };

  const handleMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    soulChat.showMoreActions();
    runClose();
  };

  const btnClass = 'w-7 h-7 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-active transition-colors';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`flex items-center gap-0.5 transition-opacity duration-150
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
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
