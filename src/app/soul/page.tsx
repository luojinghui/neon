'use client';

import '@/styles/index.css';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Modal, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ChatRoomGrid } from './components/ChatRoomGrid';
import { ChatRoomCardSkeleton } from './components/ChatRoomCardSkeleton';
import { CreateRoomModal } from './components/CreateRoomModal';
import { SearchRoomModal } from './components/SearchRoomModal';
import { soulChat } from './core';
import { useSoulStore } from './store';
import type { ChatRoom } from './components/types';

type RoomTab = 'public' | 'private';

function SoulPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RoomTab>('public');
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ChatRoom | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<ChatRoom | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const rooms = useSoulStore((state) => state.rooms);
  const roomsState = useSoulStore((state) => state.roomsState);
  const roomsError = useSoulStore((state) => state.roomsError);
  const publicRooms = useMemo(() => rooms.filter((room) => !room.isPrivate), [rooms]);
  const privateRooms = useMemo(() => rooms.filter((room) => room.isPrivate), [rooms]);
  const visibleRooms = activeTab === 'public' ? publicRooms : privateRooms;

  useEffect(() => {
    void soulChat.initList();
    return () => soulChat.destroy();
  }, []);

  const enterRoom = (room: ChatRoom) => router.push(`/soul/${encodeURIComponent(room.id)}`);

  const openCreate = () => {
    setEditingRoom(null);
    setCreateOpen(true);
  };

  const closeRoomForm = () => {
    setCreateOpen(false);
    setEditingRoom(null);
  };

  const handleRoomSaved = (room: ChatRoom) => {
    closeRoomForm();
    setActiveTab(room.isPrivate ? 'private' : 'public');
  };

  const openDelete = (room: ChatRoom) => {
    setDeleteError('');
    setDeletingRoom(room);
  };

  const handleDelete = async () => {
    if (!deletingRoom || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await soulChat.deleteRoom(deletingRoom.id);
      setDeletingRoom(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-screen w-full select-none flex-col bg-background">
      <TopBar
        middle="星球"
        right={
          <div className="flex items-center gap-2">
            <Tooltip title="搜索星球" placement="bottom">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-secondary transition-all duration-300 hover:bg-surface-hover hover:text-primary"
                aria-label="搜索星球"
              >
                <SearchOutlined className="text-sm" />
              </button>
            </Tooltip>
            <Tooltip title="创建星球" placement="bottom">
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-secondary transition-all duration-300 hover:bg-surface-hover hover:text-primary"
                aria-label="创建星球"
              >
                <PlusOutlined className="text-base" />
              </button>
            </Tooltip>
            <ThemeToggle />
          </div>
        }
      />

      <main className="w-full flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-20">
        <div className="mx-auto max-w-screen-xl px-4">
          <div className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1 shadow-sm" role="tablist" aria-label="星球类型">
            {(
              [
                ['public', `公共星球 ${publicRooms.length}`],
                ['private', `私密星球 ${privateRooms.length}`]
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-primary text-white shadow-sm' : 'text-foreground-secondary hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
          ) : visibleRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-base font-medium">{activeTab === 'private' ? '暂无私密星球' : '暂无公共星球'}</div>
              <div className="mt-2 text-center text-sm text-foreground-secondary">
                {activeTab === 'private' ? '创建私密星球后，会集中显示在这里。' : '成为第一个创建星球的人吧。'}
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="mt-6 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active"
              >
                创建星球
              </button>
            </div>
          ) : (
            <ChatRoomGrid rooms={visibleRooms} onRoomClick={enterRoom} onRoomEdit={setEditingRoom} onRoomDelete={openDelete} />
          )}
        </div>
      </main>

      <CreateRoomModal open={createOpen || Boolean(editingRoom)} room={editingRoom} onClose={closeRoomForm} onSaved={handleRoomSaved} />
      <SearchRoomModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onJoin={(room) => {
          setSearchOpen(false);
          enterRoom(room);
        }}
      />

      <Modal title="删除星球" open={Boolean(deletingRoom)} onCancel={() => setDeletingRoom(null)} footer={null} centered destroyOnHidden width={420}>
        <p className="text-sm leading-relaxed text-foreground-secondary">
          确定删除“{deletingRoom?.name}”吗？星球和全部聊天记录都会被永久移除，当前在线成员也会同步退出。
        </p>
        {deleteError && <p className="mt-3 text-xs text-danger">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setDeletingRoom(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">
            取消
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function Home() {
  return <SoulPage />;
}
