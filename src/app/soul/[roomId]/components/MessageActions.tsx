'use client';

import { CopyOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Popconfirm, Popover } from 'antd';
import { useState } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import type { MessageType } from './types';

interface MessageActionsProps {
  messageId: string;
  messageType: MessageType;
  hasAttachment: boolean;
}

export function MessageActions({ messageId, messageType, hasAttachment }: MessageActionsProps) {
  const canDelete = useSoulStore((state) => state.room?.isOwner === true);
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const canCopy = messageType === 'text';
  const canDownload = hasAttachment && ['image', 'gif', 'file'].includes(messageType);
  const canShare = canDownload;
  const actionClass =
    'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-foreground-secondary transition-colors hover:bg-surface-active hover:text-foreground';

  const close = () => {
    setDeleteConfirmOpen(false);
    setOpen(false);
  };

  const content = (
    <div className="w-32 p-1" onClick={(event) => event.stopPropagation()}>
      {canCopy && (
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            soulChat.copyMessage(messageId);
            close();
          }}
        >
          <CopyOutlined />
          <span>复制</span>
        </button>
      )}
      {canDownload && (
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            soulChat.downloadMessage(messageId);
            close();
          }}
        >
          <DownloadOutlined />
          <span>下载</span>
        </button>
      )}
      {canShare && (
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            void soulChat.shareMessage(messageId);
            close();
          }}
        >
          <ShareAltOutlined />
          <span>分享</span>
        </button>
      )}
      {canDelete && (
        <>
          {(canCopy || canDownload || canShare) && <div className="my-1 border-t border-border" />}
          <Popconfirm
            open={deleteConfirmOpen}
            title="删除这条消息？"
            description="删除后，所有成员都会同步移除。"
            okText="删除"
            cancelText="取消"
            placement="left"
            okButtonProps={{ danger: true }}
            onOpenChange={setDeleteConfirmOpen}
            onConfirm={() => {
              void soulChat.deleteMessage(messageId);
              close();
            }}
            onCancel={() => setDeleteConfirmOpen(false)}
          >
            <button type="button" className={`${actionClass} hover:bg-danger-soft hover:text-danger`} onClick={() => setDeleteConfirmOpen(true)}>
              <DeleteOutlined />
              <span>删除</span>
            </button>
          </Popconfirm>
        </>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setDeleteConfirmOpen(false);
      }}
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      styles={{ container: { padding: 4 } }}
    >
      <button
        type="button"
        onClick={(event) => event.stopPropagation()}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-muted outline-none transition-colors hover:bg-surface-active hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 ${open ? 'bg-surface-active text-foreground' : ''}`}
        aria-label="更多操作"
        aria-expanded={open}
      >
        <EllipsisOutlined className="text-base" />
      </button>
    </Popover>
  );
}
