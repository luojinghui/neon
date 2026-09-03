'use client';

import { GlobalOutlined, LockOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import type { ChatRoom } from '../../core/types';

type Props = {
  room: ChatRoom | null;
  open: boolean;
  onClose: () => void;
};

type ShareState = 'idle' | 'shared' | 'copied' | 'error';

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

export function RoomInfoModal({ room, open, onClose }: Props) {
  const [shareState, setShareState] = useState<ShareState>('idle');

  useEffect(() => {
    if (open) setShareState('idle');
  }, [open, room?.id]);

  const handleShare = async () => {
    if (!room) return;
    const url = new URL(`/soul/${encodeURIComponent(room.id)}`, window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: room.name,
          text: room.description || `邀请你加入星球“${room.name}”`,
          url
        });
        setShareState('shared');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      } else {
        setShareState('error');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareState('error');
    }
  };

  return (
    <Modal title="星球信息" open={open && Boolean(room)} onCancel={onClose} footer={null} centered destroyOnHidden width={480}>
      {room && (
        <div className="pt-1">
          <div className="flex items-start gap-3 rounded-xl bg-background-secondary p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              {room.isPrivate ? <LockOutlined /> : <GlobalOutlined />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{room.name}</h2>
              <div className="mt-1 font-mono text-xs font-medium tracking-wider text-primary">ID · {room.code}</div>
            </div>
          </div>

          <section className="mt-5">
            <h3 className="text-xs font-medium text-foreground-muted">简介</h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary">{room.description || '暂无简介'}</p>
          </section>

          {room.tags.length > 0 && (
            <section className="mt-4">
              <h3 className="text-xs font-medium text-foreground-muted">标签</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {room.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-background-secondary px-2 py-1 text-xs font-medium text-foreground-secondary">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          <dl className="mt-5 divide-y divide-border/70 rounded-xl border border-border px-4 text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-foreground-muted">可见范围</dt>
              <dd className="font-medium text-foreground">{room.isPrivate ? '私密星球' : '公开星球'}</dd>
            </div>
            {room.id !== room.code && (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-foreground-muted">房间标识</dt>
                <dd className="min-w-0 truncate font-mono text-xs text-foreground" title={room.id}>
                  {room.id}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-foreground-muted">创建时间</dt>
              <dd className="font-medium text-foreground">{formatCreatedAt(room.createdAt)}</dd>
            </div>
          </dl>

          {shareState === 'error' && <p className="mt-3 text-xs text-danger">分享失败，请稍后重试。</p>}

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              <ShareAltOutlined />
              {shareState === 'shared' ? '已分享' : shareState === 'copied' ? '链接已复制' : '分享星球'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
