'use client';

import { CopyOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, RollbackOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Popconfirm, Popover } from 'antd';
import { useRef, useState } from 'react';
import { soulChat } from '../../core';
import { useSoulStore } from '../../store';
import type { MessageType } from './types';

interface MessageActionsProps {
  messageId: string;
  messageType: MessageType;
  hasAttachment: boolean;
  isLocal: boolean;
}

const quickReplies = [
  { emoji: '🥰', label: '喜欢你' },
  { emoji: '🥺', label: '可怜巴巴' },
  { emoji: '🤭', label: '偷偷笑' },
  { emoji: '🐱', label: '猫猫贴贴' },
  { emoji: '🫶', label: '比个心' },
  { emoji: '✨', label: '闪闪发光' }
];

export function MessageActions({ messageId, messageType, hasAttachment, isLocal }: MessageActionsProps) {
  const canDelete = useSoulStore((state) => state.room?.isOwner === true);
  const connected = useSoulStore((state) => state.connectionState === 'connected');
  const isSending = useSoulStore((state) => state.isSending);
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recallConfirmOpen, setRecallConfirmOpen] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const replyPendingRef = useRef(false);
  const canCopy = messageType === 'text';
  const canDownload = hasAttachment && ['image', 'gif', 'file'].includes(messageType);
  const canShare = canDownload;
  const actionClass =
    'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-foreground-secondary transition-colors hover:bg-surface-active hover:text-foreground';

  const close = () => {
    setDeleteConfirmOpen(false);
    setRecallConfirmOpen(false);
    setOpen(false);
  };

  const reply = async (emoji: string) => {
    if (replyPendingRef.current || !connected || isSending) return;
    replyPendingRef.current = true;
    setReplyPending(true);
    setReplyError('');
    try {
      const sent = await soulChat.replyWithEmoji(messageId, emoji);
      if (sent) close();
      else setReplyError(useSoulStore.getState().chatError || '表情回复失败，请重试');
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : '表情回复失败，请重试');
    } finally {
      replyPendingRef.current = false;
      setReplyPending(false);
    }
  };

  const content = (
    <div className={`${isLocal ? 'w-32' : 'w-60'} p-1`} onClick={(event) => event.stopPropagation()}>
      {!isLocal && (
        <div className="px-1 pb-1.5 pt-1">
          <div className="mb-2 flex items-center justify-between px-1 text-xs text-foreground-muted">
            <span>快速表情回复</span>
            <span role="status">{replyPending ? '发送中…' : '回复此条消息'}</span>
          </div>
          <div className="grid grid-cols-6 gap-0.5" aria-label="选择表情回复" aria-busy={replyPending}>
            {quickReplies.map(({ emoji, label }) => (
              <button
                key={emoji}
                type="button"
                title={`${label} · 回复此条消息`}
                aria-label={`用${label}${emoji}回复此条消息`}
                disabled={!connected || isSending || replyPending}
                onClick={() => void reply(emoji)}
                className="flex h-9 min-w-0 items-center justify-center rounded-lg text-xl transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {emoji}
              </button>
            ))}
          </div>
          {replyError ? (
            <p role="alert" className="mt-2 px-1 text-xs leading-relaxed text-danger">{replyError}</p>
          ) : !connected ? (
            <p role="status" className="mt-2 px-1 text-xs text-foreground-muted">连接恢复后即可回复</p>
          ) : null}
        </div>
      )}
      {!isLocal && (canCopy || canDownload || canShare || canDelete) && <div className="h-2" />}
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
      {isLocal && (
        <>
          {(canCopy || canDownload || canShare) && <div className="h-2" />}
          <Popconfirm
            open={recallConfirmOpen}
            title="撤回这条消息？"
            description="撤回后，所有成员都会同步移除。"
            okText="撤回"
            cancelText="取消"
            placement="left"
            okButtonProps={{ danger: true }}
            onOpenChange={setRecallConfirmOpen}
            onConfirm={() => {
              void soulChat.recallMessage(messageId);
              close();
            }}
            onCancel={() => setRecallConfirmOpen(false)}
          >
            <button type="button" className={`${actionClass} hover:bg-danger-soft hover:text-danger`} onClick={() => setRecallConfirmOpen(true)}>
              <RollbackOutlined />
              <span>撤回</span>
            </button>
          </Popconfirm>
        </>
      )}
      {canDelete && !isLocal && (
        <>
          {(canCopy || canDownload || canShare) && <div className="h-2" />}
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
        if (nextOpen) setReplyError('');
        if (!nextOpen) {
          setDeleteConfirmOpen(false);
          setRecallConfirmOpen(false);
        }
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
