'use client';

import { Icon } from '@/components/ui/icon';
import { useEffect, useState } from 'react';
import { useSoulStore } from '../../store';

const readKey = (roomId: string) => `soul:announcement-read:${roomId}`;

function readSeen(roomId: string): string {
  try { return localStorage.getItem(readKey(roomId)) || ''; } catch { return ''; }
}

/** Dismissible announcement banner plus a pinned-message bar shown above the chat list. */
export function RoomNoticeBars() {
  const room = useSoulStore((s) => s.room);
  const roomId = room?.id || '';
  const announcement = room?.announcement;
  const pinned = room?.pinnedMessages || [];
  const [seen, setSeen] = useState('');
  const [pinIndex, setPinIndex] = useState(0);

  useEffect(() => { setSeen(roomId ? readSeen(roomId) : ''); }, [roomId]);
  useEffect(() => { if (pinIndex >= pinned.length) setPinIndex(0); }, [pinIndex, pinned.length]);

  if (!room || room.kind === 'direct') return null;
  const showAnnouncement = Boolean(announcement?.text) && announcement?.updatedAt !== seen;
  const current = pinned[pinIndex] || pinned[0];
  if (!showAnnouncement && !current) return null;

  const dismiss = () => {
    if (!announcement) return;
    setSeen(announcement.updatedAt);
    try { localStorage.setItem(readKey(roomId), announcement.updatedAt); } catch { /* storage unavailable */ }
  };

  return (
    <div className="app-content-width flex shrink-0 flex-col gap-1.5 pt-[var(--app-page-top)]">
      {showAnnouncement && announcement && (
        <div role="status" className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-foreground">
          <Icon name="info-circle" size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap break-words"><span className="font-medium text-primary">公告 · </span>{announcement.text}</p>
          <button type="button" aria-label="关闭公告提示" onClick={dismiss} className="shrink-0 text-foreground-muted hover:text-foreground"><Icon name="close" size={14} /></button>
        </div>
      )}
      {current && (
        <button
          type="button"
          aria-label={`定位置顶消息：${current.content}`}
          onClick={() => { useSoulStore.getState().setJumpToMessageId(current.id); setPinIndex((pinIndex + 1) % pinned.length); }}
          className="flex w-full items-center gap-2 rounded-lg bg-surface-inset px-3 py-1.5 text-left text-xs text-foreground-secondary"
        >
          <span className="shrink-0 font-medium text-primary">置顶{pinned.length > 1 ? ` ${pinIndex + 1}/${pinned.length}` : ''}</span>
          <span className="min-w-0 flex-1 truncate">{current.senderName}：{current.type === 'text' || current.type === 'markdown' ? current.content : `[${current.type}]`}</span>
        </button>
      )}
    </div>
  );
}
