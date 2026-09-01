'use client';

import '@/styles/index.css';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ChatRoomGrid } from './components/ChatRoomGrid';
import { ChatRoomCardSkeleton } from './components/ChatRoomCardSkeleton';
import { CreateRoomModal } from './components/CreateRoomModal';
import { soulChat } from './core';
import { useSoulStore } from './store';
import type { ChatRoom } from './components/types';

function SoulPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const rooms = useSoulStore((state) => state.rooms);
  const roomsState = useSoulStore((state) => state.roomsState);
  const roomsError = useSoulStore((state) => state.roomsError);

  useEffect(() => {
    void soulChat.initList();
    return () => soulChat.destroy();
  }, []);

  const enterRoom = (room: ChatRoom) => router.push(`/soul/${encodeURIComponent(room.id)}`);

  return (
    <div className="flex h-screen w-full select-none flex-col bg-background">
      <TopBar middle="星球" right={<ThemeToggle />} />

      <main className="w-full flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-20">
        <div className="mx-auto max-w-screen-xl px-4">
          <section className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">找到同频的星球旅人</h1>
              <p className="mt-1 text-sm text-foreground-secondary">加入公共群聊，或者创建一个属于新话题的聊天室。</p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <PlusOutlined />
              创建聊天室
            </button>
          </section>

          {roomsState === 'loading' || roomsState === 'idle' ? (
            <ChatRoomCardSkeleton count={6} />
          ) : roomsState === 'error' ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-base font-medium">加载失败</div>
              <div className="mt-2 text-center text-sm text-foreground-secondary">{roomsError || '请稍后重试'}</div>
              <button
                type="button"
                onClick={() => void soulChat.loadRooms()}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <ReloadOutlined />
                重试
              </button>
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-base font-medium">暂无在线聊天室</div>
              <div className="mt-2 text-center text-sm text-foreground-secondary">成为第一个创建星球聊天室的人吧。</div>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-6 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active"
              >
                创建聊天室
              </button>
            </div>
          ) : (
            <ChatRoomGrid rooms={rooms} onRoomClick={enterRoom} />
          )}
        </div>
      </main>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(roomId) => router.push(`/soul/${encodeURIComponent(roomId)}`)} />
    </div>
  );
}

export default function Home() {
  return <SoulPage />;
}
