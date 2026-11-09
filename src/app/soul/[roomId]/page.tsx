'use client';

import { Button } from '@/components/ui/button';
import '@/styles/index.css';
import { useEffect, useState } from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Badge } from '@/components/ui/display';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { createProfileHref } from '@/app/profile/navigation';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ContactActions } from '@/app/social/ContactActions';
import { soulChat } from '../core';
import { useSoulStore } from '../store';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ChatToolbar } from './components/ChatToolbar';
import { Icon } from '@/components/ui/icon';
import { RoomAccessModal } from './components/RoomAccessModal';
import { RoomInfoModal } from './components/RoomInfoModal';
import { RoomCallNotice, RoomCallProvider } from './components/RoomCall';

function ChatRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const room = useSoulStore((s) => s.room);
  const roomName = useSoulStore((s) => s.roomName);
  const accessState = useSoulStore((s) => s.accessState);
  const connected = useSoulStore((s) => s.connectionState === 'connected');
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const direct = room?.kind === 'direct' || params.roomId.startsWith('dm-');

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get('invite') || '';
    void soulChat.initRoom(params.roomId, inviteToken);

    return () => {
      soulChat.destroy();
    };
  }, [params.roomId]);

  useEffect(() => {
    if (accessState === 'deleted') router.replace(direct ? '/profile' : '/soul');
  }, [accessState, router, direct]);

  return (
    <RoomCallProvider roomId={params.roomId} roomName={roomName} ready={!direct && connected && accessState === 'granted'}>
    <div
      className="app-screen soul-page soul-room-page flex w-full select-none flex-col bg-background"
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
      }}
    >
      <TopBar
        middle={
          direct ? <div className="flex min-w-0 flex-col items-center"><span className="truncate text-sm font-medium">{roomName || '私信'}</span><span className="text-[10px] text-foreground-muted">一对一私信</span></div> : <Button variant="ghost"
              type="button"
              onClick={() => setRoomInfoOpen(true)}
              disabled={!room || accessState !== 'granted'}
              className="pointer-events-auto inline-flex max-w-full items-center gap-1.5 px-2 py-1 text-base font-medium"
              aria-label={`查看${roomName || '星球'}信息`}
            >
              <span className="truncate">{roomName || '加载中...'}</span>
              <Badge dot={Boolean(room?.pendingRequestCount)} offset={[2, -2]}>
                <InfoCircleOutlined className="block shrink-0 text-sm text-foreground-muted" aria-hidden />
              </Badge>
            </Button>
        }
        right={
          <div className="flex items-center gap-2">
            <ProfileShortcut returnTo={`/soul/${params.roomId}`} />
            <ThemeToggle />
          </div>
        }
        backHref={direct ? '/profile?section=messages' : '/soul'}
        backLabel={direct ? '个人中心' : '星球'}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {accessState === 'granted' ? <MessageList className="pt-[var(--app-page-top)]" /> : accessState === 'joining' ? <div className="flex flex-1 flex-col items-center justify-center gap-2 text-caption text-foreground-muted" role="status"><Icon name="loading" />正在进入星球…</div> : <div className="flex-1" />}

        {accessState === 'granted' && (
          <div className="app-content-width shrink-0 pb-3 pt-2">
            {direct && room?.peer ? <div className="flex flex-wrap items-center justify-between gap-2"><Link className="text-xs text-primary" href={createProfileHref(room.peer.userId, { publicKey: room.peer.publicKey, returnTo: `/soul/${params.roomId}` })}>查看对方主页</Link><ContactActions contact={room.peer} showMessage={false} /></div> : <RoomCallNotice />}
            <Card as="div" padding="sm" bodyWrap={false}>
              <ChatInput />
              <ChatToolbar />
            </Card>
          </div>
        )}
      </div>

      <RoomAccessModal onBack={() => router.replace(direct ? '/profile' : '/soul')} />
      {!direct && <RoomInfoModal room={room} open={roomInfoOpen} onClose={() => setRoomInfoOpen(false)} />}
    </div>
    </RoomCallProvider>
  );
}

export default function RoomPage() {
  return <ChatRoomPage />;
}
