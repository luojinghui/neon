'use client';

import '@/styles/index.css';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { soulChat } from '../core';
import { useSoulStore } from '../store';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ChatToolbar } from './components/ChatToolbar';

function ChatRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomName = useSoulStore((s) => s.roomName);
  const connectionState = useSoulStore((s) => s.connectionState);

  useEffect(() => {
    void soulChat.initRoom(params.roomId);

    return () => {
      soulChat.destroy();
    };
  }, [params.roomId]);

  return (
    <div className="h-screen w-full bg-background flex flex-col select-none">
      <TopBar
        middle={
          <div className="flex items-center justify-center gap-2">
            <span className="truncate text-base font-medium">{roomName || '加载中...'}</span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                connectionState === 'connected' ? 'bg-success' : connectionState === 'connecting' ? 'animate-pulse bg-warning' : 'bg-danger'
              }`}
              title={connectionState === 'connected' ? '已连接' : connectionState === 'connecting' ? '连接中' : '已断开'}
            />
          </div>
        }
        right={<ThemeToggle />}
        fallbackHref="/soul"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageList className="pt-20" />

        <div className="mx-auto w-full max-w-screen-xl shrink-0 px-4 pb-3 pt-3">
          <ChatInput />
          <ChatToolbar />
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  return <ChatRoomPage />;
}
