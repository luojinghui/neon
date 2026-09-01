'use client';

import type { ChatRoom } from './types';

function handleCardKeyDown(e: React.KeyboardEvent, onClick?: () => void) {
  if (!onClick) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick();
  }
}

export function ChatRoomCard({ room, onClick, onPrimaryAction }: { room: ChatRoom; onClick?: () => void; onPrimaryAction?: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => handleCardKeyDown(e, onClick)}
      className="group relative flex h-full min-h-[250px] flex-col rounded-lg border border-border p-4
                 shadow-sm transition-all duration-300
                 hover:shadow-md hover:-translate-y-1
                 bg-surface backdrop-blur-sm
                 hover:border-primary/50"
      aria-label={`进入聊天室：${room.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2">{room.name}</h3>
        <span className="shrink-0 inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-success-soft text-success border border-success/20">在线</span>
      </div>

      <div className="mt-2 text-xs text-foreground-muted">{room.onlineCount > 0 ? `${room.onlineCount} 人在线` : '等待旅人加入'}</div>

      {room.description ? (
        <p className="mt-3 text-sm text-foreground-secondary leading-relaxed line-clamp-2 min-h-[2.5rem]">{room.description}</p>
      ) : (
        <p className="mt-3 text-sm text-foreground-secondary leading-relaxed line-clamp-2 min-h-[2.5rem]">暂无简介</p>
      )}

      <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
        {room.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="inline-flex items-center rounded-lg bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction?.();
          }}
          className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-medium
                     bg-primary text-white hover:bg-primary-hover transition-colors
                     focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
          进入
        </button>
      </div>
    </div>
  );
}
