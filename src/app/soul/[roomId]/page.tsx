'use client';

import '@/styles/index.css';
import { useEffect, useState } from 'react';
import { InfoCircleOutlined, UserOutlined } from '@ant-design/icons';
import { Badge, Tooltip } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { createProfileHref } from '@/app/profile/navigation';
import { soulChat } from '../core';
import { useSoulStore } from '../store';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ChatToolbar } from './components/ChatToolbar';
import { RoomAccessModal } from './components/RoomAccessModal';
import { RoomInfoModal } from './components/RoomInfoModal';

function ChatRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const room = useSoulStore((s) => s.room);
  const roomName = useSoulStore((s) => s.roomName);
  const accessState = useSoulStore((s) => s.accessState);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('invite') || '';
    void soulChat.initRoom(params.roomId, inviteToken);

    return () => {
      soulChat.destroy();
    };
  }, [params.roomId]);

  useEffect(() => {
    if (accessState === 'deleted') router.replace('/soul');
  }, [accessState, router]);

  return (
    <div
      className="app-screen soul-page soul-room-page flex w-full select-none flex-col bg-background"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
      }}
    >
      <TopBar
        middle={
          <Tooltip title="星球信息" placement="bottom">
            <button
              type="button"
              onClick={() => setRoomInfoOpen(true)}
              disabled={!room || accessState !== 'granted'}
              className="pointer-events-auto inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-base font-medium transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-default disabled:opacity-60"
              aria-label={`查看${roomName || '星球'}信息`}
            >
              <span className="truncate">{roomName || '加载中...'}</span>
              <Badge dot={Boolean(room?.pendingRequestCount)} offset={[2, -2]}>
                <InfoCircleOutlined className="block shrink-0 text-sm text-foreground-muted" aria-hidden />
              </Badge>
            </button>
          </Tooltip>
        }
        right={
          <div className="flex items-center gap-2">
            <Link
              href={createProfileHref('', { returnTo: `/soul/${params.roomId}` })}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/60 text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-primary"
              aria-label="个人中心"
            >
              <UserOutlined className="text-sm" />
            </Link>
            <ThemeToggle />
          </div>
        }
        backHref="/soul"
        backLabel="星球"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {accessState === 'granted' ? <MessageList className="pt-[var(--app-page-top)]" /> : <div className="flex-1" />}

        {accessState === 'granted' && (
          <div className="app-content-width shrink-0 pb-3 pt-2">
            <div className="rounded-2xl border border-border bg-surface p-2.5 transition-colors focus-within:border-border-focus">
              <ChatInput />
              <ChatToolbar />
            </div>
          </div>
        )}
      </div>

      <RoomAccessModal onBack={() => router.replace('/soul')} />
      <RoomInfoModal room={room} open={roomInfoOpen} onClose={() => setRoomInfoOpen(false)} />
    </div>
  );
}

export default function RoomPage() {
  return <ChatRoomPage />;
}
