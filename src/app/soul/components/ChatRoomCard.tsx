'use client';

import { DeleteOutlined, EditOutlined, EllipsisOutlined, LockOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import type { ChatRoom } from './types';

function handleCardKeyDown(e: React.KeyboardEvent, onClick?: () => void) {
  if (!onClick) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick();
  }
}

type Props = {
  room: ChatRoom;
  onClick?: () => void;
  onPrimaryAction?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function ChatRoomCard({ room, onClick, onPrimaryAction, onEdit, onDelete }: Props) {
  const menuItems: MenuProps['items'] = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑聊天室' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除聊天室', danger: true }
  ];

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
        <div className="flex shrink-0 items-center gap-1">
          <span className="inline-flex items-center rounded-lg border border-success/20 bg-success-soft px-2 py-0.5 text-xs font-medium text-success">在线</span>
          {room.isOwner && (
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: menuItems,
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  if (key === 'edit') onEdit?.();
                  if (key === 'delete') onDelete?.();
                }
              }}
            >
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-active hover:text-foreground"
                aria-label={`管理聊天室：${room.name}`}
              >
                <EllipsisOutlined />
              </button>
            </Dropdown>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-primary/15 bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-primary">ID · {room.code}</span>
        {room.isPrivate && <span className="text-[11px] font-medium text-foreground-muted">私密</span>}
        {room.hasPassword && <LockOutlined className="text-[11px] text-foreground-muted" aria-label="需要密码" />}
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
