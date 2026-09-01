'use client';

import { CopyOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { Popconfirm } from 'antd';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import type { MessageType } from './types';

interface MessageActionsProps {
  messageId: string;
  messageType: MessageType;
  visible: boolean;
  onRequestClose?: () => void;
}

export function MessageActions({ messageId, messageType, visible, onRequestClose }: MessageActionsProps) {
  const canDelete = useSoulStore((state) => state.room?.isOwner === true);
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
      {canDelete && (
        <Popconfirm
          title="删除这条消息？"
          description="删除后，所有成员都会同步移除。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => soulChat.deleteMessage(messageId)}
          onCancel={runClose}
        >
          <button type="button" className={`${btnClass} hover:text-danger`} onClick={(event) => event.stopPropagation()} aria-label="删除消息">
            <DeleteOutlined className="text-xs" />
          </button>
        </Popconfirm>
      )}
    </div>
  );
}
