'use client';

import { ArrowRightOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, LockOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import type { ChatRoom } from './types';

type Props = {
  room: ChatRoom;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function ChatRoomCard({ room, onClick, onEdit, onDelete }: Props) {
  const menuItems: MenuProps['items'] = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑星球' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除星球', danger: true }
  ];

  return (
    <article className="group relative flex min-h-[166px] flex-col overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-border-hover hover:shadow-md">
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        aria-label={`进入星球：${room.name}`}
      />

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 min-w-0 text-base font-semibold leading-6 text-foreground">{room.name}</h3>
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
                className="pointer-events-auto relative z-10 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-active hover:text-foreground"
                aria-label={`管理星球：${room.name}`}
              >
                <EllipsisOutlined />
              </button>
            </Dropdown>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-foreground-secondary">{room.description || '来这里坐坐，随便聊点什么。'}</p>

        {room.tags.length > 0 && (
          <div className="mt-2.5 flex min-h-5 flex-wrap gap-1.5">
            {room.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-md bg-background-secondary px-2 py-0.5 text-[11px] font-medium text-foreground-secondary">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between border-t border-border/70 pt-3 text-[11px] text-foreground-muted">
            <div className="flex items-center gap-2">
              {room.isPrivate && <span>私密</span>}
              {room.hasPassword && <LockOutlined aria-label="需要密码" />}
              <span className="font-mono tracking-wide opacity-70">#{room.code}</span>
            </div>
            <span className="inline-flex items-center gap-1 font-medium text-foreground-secondary transition-colors group-hover:text-primary">
              进入
              <ArrowRightOutlined className="text-[10px]" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
