'use client';

import '@/styles/index.css';
import { useEffect } from 'react';
import { UserOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { soulChat } from '../core';
import { useSoulStore } from '../store';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ChatToolbar } from './components/ChatToolbar';
import { RoomAccessModal } from './components/RoomAccessModal';

function ChatRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomName = useSoulStore((s) => s.roomName);
  const accessState = useSoulStore((s) => s.accessState);

  useEffect(() => {
    void soulChat.initRoom(params.roomId);

    return () => {
      soulChat.destroy();
    };
  }, [params.roomId]);

  useEffect(() => {
    if (accessState === 'deleted') router.replace('/soul');
  }, [accessState, router]);

  return (
    <div
      className="soul-room-page flex h-screen w-full select-none flex-col bg-background"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
      }}
    >
      <TopBar
        middle={
          <span className="truncate text-base font-medium">{roomName || '加载中...'}</span>
        }
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-primary"
              aria-label="个人中心"
            >
              <UserOutlined className="text-sm" />
            </Link>
            <ThemeToggle />
          </div>
        }
        fallbackHref="/soul"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {accessState === 'granted' ? <MessageList className="pt-20" /> : <div className="flex-1" />}

        {accessState === 'granted' && (
          <div className="mx-auto w-full max-w-screen-xl shrink-0 px-4 pb-3 pt-3">
            <ChatInput />
            <ChatToolbar />
          </div>
        )}
      </div>

      <RoomAccessModal onBack={() => router.replace('/soul')} />
    </div>
  );
}

export default function RoomPage() {
  return <ChatRoomPage />;
}
