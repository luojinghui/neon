'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { Button, buttonClassName } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import '@/styles/index.css';
import { Icon } from '@/components/ui/icon';
import { Dropdown } from 'antd';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { createProfileHref } from '../profile/navigation';
import { ProfileShortcut } from '../profile/components/ProfileShortcut';
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
            <ProfileShortcut returnTo="/soul" />
            <Tooltip title="搜索星球" placement="bottom">
              <Button size="sm" variant="outline" iconOnly
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center"
                aria-label="搜索星球"
              >
                <Icon name="search" />
              </Button>
            </Tooltip>
            <Tooltip title="更多" placement="bottom">
              <Dropdown
                open={moreOpen}
                onOpenChange={setMoreOpen}
                trigger={['click']}
                placement="bottomRight"
                arrow={false}
                popupRender={() => (
                  <div className="w-44 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                    <Link
                      href={createProfileHref('', { returnTo: '/soul' })}
                      onClick={() => setMoreOpen(false)}
                      className={buttonClassName({ variant: 'ghost', className: 'flex h-9 w-full items-center justify-start gap-2.5 px-3 text-body' })}
                    >
                      <Icon name="user" />
                      <span>个人中心</span>
                    </Link>
                    <div className="flex min-h-10 items-center justify-between gap-3 rounded-md px-3 text-body text-foreground-secondary">
                      <span>主题模式</span>
                      <ThemeToggle />
                    </div>
                  </div>
                )}
              >
                <Button size="sm" variant="outline" iconOnly
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center"
                  aria-label="更多操作"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  <Icon name="more" />
                </Button>
              </Dropdown>
            </Tooltip>
          </div>
        }
      />

      <main className="w-full flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-[var(--app-page-top)]">
        <div className="app-content-width">
          <div className="mb-5 flex min-w-0 items-center justify-between gap-2">
            <Tabs id="soul-room-tabs" panelId="soul-room-panel" size="md" className="min-w-0" aria-label="星球类型" activeKey={activeTab}
              onChange={key => setActiveTab(key as RoomTab)} items={[
                { key: 'public', label: `公共星球 ${publicRooms.length}` },
                { key: 'owned', label: `我的 ${ownedRooms.length}` },
                { key: 'joined', label: `已加入 ${joinedRooms.length}` }
              ]} />
            <Button variant="outline" size="md"
              type="button"
              onClick={openCreate}
              className="w-9 shrink-0 sm:w-auto"
              aria-label="创建星球"
              title="创建星球"
            >
              <Icon name="plus" />
              <span className="hidden sm:inline">创建星球</span>
            </Button>
          </div>

          {roomsState === 'ready' && roomsError && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-caption text-foreground-muted"><span>暂时无法更新，正在显示上次的星球列表</span><Button variant="ghost" type="button" onClick={() => void soulChat.initList()} className="shrink-0 px-2 py-1">重试</Button></div>}
          <div id="soul-room-panel" role="tabpanel" aria-labelledby={`soul-room-tabs-tab-${activeTab}`}>
          {roomsState === 'loading' || roomsState === 'idle' ? (
            <ChatRoomCardSkeleton count={6} />
          ) : roomsState === 'error' ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-body-lg font-medium">加载失败</div>
              <div className="mt-2 text-center text-body text-foreground-secondary">{roomsError || '请稍后重试'}</div>
              <Button variant="primary"
                type="button"
                onClick={() => void soulChat.initList()}
                className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2 text-body font-medium"
              >
                <Icon name="refresh" />
                重试
              </Button>
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground">
              <div className="text-body-lg font-medium">{activeTab === 'owned' ? '暂无我的私密星球' : activeTab === 'joined' ? '暂无已加入的星球' : '暂无公共星球'}</div>
              <div className="mt-2 text-center text-body text-foreground-secondary">
                {activeTab === 'owned' ? '你创建的私密星球会显示在这里。' : activeTab === 'joined' ? '申请通过或使用邀请链接后会显示在这里。' : '成为第一个创建星球的人吧。'}
              </div>
              {activeTab !== 'joined' && (
                <Button variant="outline" type="button" onClick={openCreate} className="mt-6 px-4 py-2 text-body font-medium">创建星球</Button>
              )}
            </div>
          ) : (
            <ChatRoomGrid rooms={visibleRooms} onRoomClick={enterRoom} onRoomEdit={setEditingRoom} onRoomDelete={openDelete} />
          )}
          </div>
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
        <p className="text-body leading-relaxed text-foreground-secondary">
          确定删除“{deletingRoom?.name}”吗？星球和全部聊天记录都会被永久移除，当前在线成员也会同步退出。
        </p>
        {deleteError && <p className="mt-3 text-caption text-danger">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => setDeletingRoom(null)} className="px-4 py-2 text-body font-medium">
            取消
          </Button>
          <Button variant="primary"
            type="button"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
            className="px-4 py-2 text-body font-medium"
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function Home() {
  return <SoulPage />;
}
