'use client';

import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { soulChat } from '../../core';
import type { MessageType } from './types';

interface MessageActionsProps {
  messageId: string;
  messageType: MessageType;
  visible: boolean;
  onRequestClose?: () => void;
}

export function MessageActions({ messageId, messageType, visible, onRequestClose }: MessageActionsProps) {
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

  const btnClass = 'w-7 h-7 flex items-center justify-center rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-active transition-colors';
  const canCopy = messageType === 'text';
  const canDownload = messageType === 'image' || messageType === 'gif' || messageType === 'file';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`flex items-center gap-0.5 transition-opacity duration-150 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {canCopy && (
        <button type="button" className={btnClass} onClick={handleCopy} aria-label="复制">
          <CopyOutlined className="text-xs" />
        </button>
      )}
      {canDownload && (
        <button type="button" className={btnClass} onClick={handleDownload} aria-label="下载">
          <DownloadOutlined className="text-xs" />
        </button>
      )}
    </div>
  );
}
