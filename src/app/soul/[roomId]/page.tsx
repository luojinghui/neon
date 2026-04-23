'use client';

import '@/styles/index.css';
import { App } from 'antd';
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
  const { message } = App.useApp();
  const params = useParams<{ roomId: string }>();
  const roomName = useSoulStore((s) => s.roomName);

  useEffect(() => {
    soulChat.setMessage(message);
    soulChat.init(params.roomId);

    return () => {
      soulChat.destroy();
    };
  }, [params.roomId, message]);

  return (
    <div className="h-screen w-full bg-background flex flex-col select-none">
      <TopBar middle={roomName || '加载中...'} right={<ThemeToggle />} fallbackHref="/soul" />

      <div className="flex-1 overflow-hidden pt-20 flex flex-col max-w-screen-xl mx-auto w-full px-4">
        <MessageList />

        <div className="shrink-0 pt-3 pb-3">
          <ChatInput />
          <ChatToolbar />
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <App>
      <ChatRoomPage />
    </App>
  );
}
