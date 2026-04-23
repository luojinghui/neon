'use client';

import '@/styles/index.css';
import { App } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import type { ChatRoom } from './components/types';
import { createMockRooms } from './components/mock';
import { ChatRoomGrid } from './components/ChatRoomGrid';
import { ChatRoomCardSkeleton } from './components/ChatRoomCardSkeleton';

type ViewState = 'loading' | 'ready' | 'empty' | 'error';

function SoulPage() {
  const router = useRouter();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  const loadRooms = useCallback((next: { force?: 'ready' | 'empty' | 'error' } = {}) => {
    setViewState('loading');

    window.setTimeout(() => {
      if (next.force === 'error') {
        setRooms([]);
        setViewState('error');
        return;
      }

      if (next.force === 'empty') {
        setRooms([]);
        setViewState('empty');
        return;
      }

      const data = createMockRooms(12);
      setRooms(data);
      setViewState(data.length > 0 ? 'ready' : 'empty');
    }, 450);
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleRoomClick = (room: ChatRoom) => {
    router.push(`/soul/${room.id}`);
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col select-none">
      <TopBar middle="星球" right={<ThemeToggle />} />

      <div className="w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-screen-xl mx-auto px-4">
          {viewState === 'loading' ? (
            <ChatRoomCardSkeleton count={8} />
          ) : viewState === 'error' ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-base font-medium">加载失败</div>
              <div className="mt-2 text-sm text-foreground-secondary">请稍后重试</div>
              <button
                type="button"
                onClick={() => loadRooms({ force: 'ready' })}
                className="mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                重试
              </button>
            </div>
          ) : viewState === 'empty' ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-base font-medium">暂无在线聊天室</div>
              <div className="mt-2 text-sm text-foreground-secondary text-center">稍后再来看看，或创建一个新房间（后续支持）</div>
              <button
                type="button"
                onClick={() => loadRooms({ force: 'ready' })}
                className="mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-surface hover:bg-surface-hover text-foreground border border-border transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                刷新
              </button>
            </div>
          ) : (
            <ChatRoomGrid rooms={rooms} onRoomClick={handleRoomClick} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <App>
      <SoulPage />
    </App>
  );
}
