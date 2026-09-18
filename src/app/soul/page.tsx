'use client';

import '@/styles/index.css';
import { MoreOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { Dropdown, Modal, Tooltip } from 'antd';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { createProfileHref } from '../profile/navigation';
import { ChatRoomGrid } from './components/ChatRoomGrid';
import { ChatRoomCardSkeleton } from './components/ChatRoomCardSkeleton';
import { CreateRoomModal } from './components/CreateRoomModal';
import { SearchRoomModal } from './components/SearchRoomModal';
import { soulChat } from './core';
import { useSoulStore } from './store';
import type { ChatRoom } from './components/types';

type RoomTab = 'public' | 'owned' | 'joined';

function SoulPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RoomTab>('public');
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ChatRoom | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<ChatRoom | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const rooms = useSoulStore((state) => state.rooms);
  const roomsState = useSoulStore((state) => state.roomsState);
  const roomsError = useSoulStore((state) => state.roomsError);
  const publicRooms = useMemo(() => rooms.filter((room) => !room.isPrivate), [rooms]);
  const ownedRooms = useMemo(() => rooms.filter((room) => room.isPrivate && ['owner', 'admin'].includes(room.membership)), [rooms]);
  const joinedRooms = useMemo(() => rooms.filter((room) => room.isPrivate && room.membership === 'approved'), [rooms]);
  const visibleRooms = activeTab === 'public' ? publicRooms : activeTab === 'owned' ? ownedRooms : joinedRooms;

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
    setActiveTab(room.isPrivate ? 'owned' : 'public');
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
    <div className="app-screen soul-page flex w-full select-none flex-col bg-background">
      <TopBar
        middle="星球"
        backHref="/"
        backLabel="首页"
        right={
          <div className="flex items-center gap-2">
            <Tooltip title="搜索星球" placement="bottom">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/60 text-foreground-secondary transition-all duration-300 hover:bg-surface-hover hover:text-primary"
                aria-label="搜索星球"
              >
                <SearchOutlined className="text-sm" />
              </button>
            </Tooltip>
            <Tooltip title="更多" placement="bottom">
              <Dropdown
                open={moreOpen}
                onOpenChange={setMoreOpen}
                trigger={['click']}
                placement="bottomRight"
                arrow={false}
                dropdownRender={() => (
                  <div className="w-44 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                    <Link
                      href={createProfileHref('', { returnTo: '/soul' })}
                      onClick={() => setMoreOpen(false)}
                      className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-foreground-secondary transition-colors hover:bg-surface-active hover:text-foreground"
                    >
                      <UserOutlined />
                      <span>个人中心</span>
                    </Link>
                    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 text-sm text-foreground-secondary">
                      <span>主题模式</span>
                      <ThemeToggle />
                    </div>
                  </div>
                )}
              >
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/60 text-foreground-secondary transition-all duration-300 hover:bg-surface-hover hover:text-primary"
                  aria-label="更多操作"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  <MoreOutlined className="text-base" />
                </button>
              </Dropdown>
            </Tooltip>
          </div>
        }
      />

      <main className="w-full flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-[var(--app-page-top)]">
        <div className="app-content-width">
          <div className="mb-5 flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1" role="tablist" aria-label="星球类型">
              {(
                [
                  ['public', `公共星球 ${publicRooms.length}`],
                  ['owned', `我的 ${ownedRooms.length}`],
                  ['joined', `已加入 ${joinedRooms.length}`]
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`h-9 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                    activeTab === tab ? 'bg-primary-soft text-primary' : 'text-foreground-secondary hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-auto sm:px-3"
              aria-label="创建星球"
              title="创建星球"
            >
              <PlusOutlined />
              <span className="hidden sm:inline">创建星球</span>
            </button>
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
              <div className="text-base font-medium">{activeTab === 'owned' ? '暂无我的私密星球' : activeTab === 'joined' ? '暂无已加入的星球' : '暂无公共星球'}</div>
              <div className="mt-2 text-center text-sm text-foreground-secondary">
                {activeTab === 'owned' ? '你创建的私密星球会显示在这里。' : activeTab === 'joined' ? '申请通过或使用邀请链接后会显示在这里。' : '成为第一个创建星球的人吧。'}
              </div>
              {activeTab !== 'joined' && (
                <button type="button" onClick={openCreate} className="mt-6 rounded-lg bg-surface-hover px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-active">创建星球</button>
              )}
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
