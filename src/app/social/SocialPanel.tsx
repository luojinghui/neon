'use client';

import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MessageOutlined, ReloadOutlined, SearchOutlined, StarOutlined, UserAddOutlined } from '@ant-design/icons';
import { Badge } from 'antd';
import { useRef, useState } from 'react';
import { createProfileHref } from '../profile/navigation';
import { getProfileAvatar } from '../profile/types';
import { ContactActions } from './ContactActions';
import { refreshSocial, useSocialStore } from './client';

export function SocialPanel({ section }: { section: 'messages' | 'friends' }) {
  const router = useRouter();
  const { conversations, favorites, error, ready } = useSocialStore();
  const [queries, setQueries] = useState({ messages: '', friends: '' });
  const [userId, setUserId] = useState('');
  const [findUserOpen, setFindUserOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const userIdInput = useRef<HTMLInputElement>(null);
  const isFriends = section === 'friends';
  const query = queries[section];
  const search = query.trim().toLowerCase();
  const items = conversations.filter((item) => `${item.peer.name} ${item.peer.userId} ${item.lastMessage?.content || ''}`.toLowerCase().includes(search));
  const friends = favorites.filter((item) => `${item.name} ${item.userId}`.toLowerCase().includes(search));
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshSocial(); }
    finally { setRefreshing(false); }
  };

  return <section className="pt-5" aria-label={section === 'messages' ? '我的私信列表' : '我的好友收藏'}>
    <div className="mb-4 flex items-center gap-2">
      <div className="min-w-0 flex-1 sm:max-w-72">
        <Input prefix={<SearchOutlined aria-hidden="true" />} allowClear
          type="search"
          aria-label={isFriends ? '搜索好友昵称或 ID' : '搜索私信昵称、ID 或内容'}
          placeholder={isFriends ? '搜索好友' : '搜索私信'}
          value={query}
          onChange={(event) => setQueries((current) => ({ ...current, [section]: event.target.value }))}
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {isFriends && <Button variant="primary"
          type="button"
          aria-haspopup="dialog"
          onClick={() => { setUserId(''); setFindUserOpen(true); }} className="inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <UserAddOutlined aria-hidden="true" />找朋友
        </Button>}
        <Button variant="ghost" iconOnly
          type="button"
          aria-label={isFriends ? '刷新好友收藏' : '刷新私信'}
          title="刷新"
          disabled={refreshing}
          onClick={() => void handleRefresh()} className="inline-flex w-9 items-center justify-center"
        >
          <ReloadOutlined spin={refreshing} aria-hidden="true" />
        </Button>
      </div>
    </div>
    {isFriends && <Modal
      title="找朋友"
      open={findUserOpen}
      onCancel={() => setFindUserOpen(false)}
      afterOpenChange={(open) => { if (open) userIdInput.current?.focus(); }}
      footer={null}
      centered
      destroyOnHidden
      width={400}
    >
      <p className="mb-4 text-sm text-foreground-muted">输入对方的用户 ID，前往主页收藏或发私信。</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!userId.trim()) return;
        setFindUserOpen(false);
        router.push(createProfileHref(userId.trim(), { returnTo: '/profile' }));
      }}>
        <label htmlFor="social-user-id" className="mb-2 block text-sm font-medium text-foreground">用户 ID</label>
        <Input
          ref={userIdInput}
          id="social-user-id"
          placeholder="输入用户 ID"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => setFindUserOpen(false)}>取消</Button>
          <Button variant="primary" type="submit" disabled={!userId.trim()}>查看主页</Button>
        </div>
      </form>
    </Modal>}
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    {!ready && !error && <p role="status" className="py-6 text-sm text-foreground-muted">正在加载…</p>}
    {section === 'messages' ? <div className="divide-y divide-border">
      {items.map((item) => <Link key={item.id} href={`/soul/${encodeURIComponent(item.id)}`} className="flex items-center gap-3 rounded-md px-3 py-4 transition-colors hover:bg-surface-hover">
        <Image src={getProfileAvatar(item.peer)} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-full bg-surface-inset object-cover" />
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{item.peer.name}</span><time className="shrink-0 text-xs text-foreground-muted">{new Date(item.lastMessageAt || item.createdAt).toLocaleDateString('zh-CN')}</time></div><p className="mt-1 truncate text-sm text-foreground-muted">{item.lastMessage ? (item.lastMessage.type === 'text' ? item.lastMessage.content : `[${item.lastMessage.type === 'file' ? '文件' : '图片'}] ${item.lastMessage.content}`) : '开始聊天吧'}</p></div>
        <Badge count={item.unreadCount} overflowCount={99} />
      </Link>)}
      {ready && items.length === 0 && <div className="flex flex-col items-center py-10 text-center">
        <MessageOutlined className="mb-3 text-2xl text-foreground-muted/60" aria-hidden="true" />
        <p className="text-sm text-foreground-secondary">{search ? '没有匹配的私信' : '让对话从一句你好开始'}</p>
        <p className="mt-2 text-xs text-foreground-muted">{search ? '换个关键词试试。' : '在对方主页发起私信，聊聊共同感兴趣的事。'}</p>
      </div>}
    </div> : <div className="divide-y divide-border">
      {friends.map((contact) => <div key={contact.publicKey} className="flex items-center gap-3 py-4">
        <Link href={createProfileHref(contact.userId, { publicKey: contact.publicKey, returnTo: '/profile' })} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image src={getProfileAvatar(contact)} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-full bg-surface-inset object-cover" />
          <div className="min-w-0"><p className="truncate text-sm font-medium">{contact.name}</p><p className="mt-1 truncate text-xs text-foreground-muted">@{contact.userId}</p></div>
        </Link>
        <ContactActions contact={contact} compact />
      </div>)}
      {ready && friends.length === 0 && <div className="flex flex-col items-center py-10 text-center">
        <StarOutlined className="mb-3 text-2xl text-foreground-muted/60" aria-hidden="true" />
        <p className="text-sm text-foreground-secondary">{search ? '没有匹配的好友' : '把同频的人，留在身边'}</p>
        <p className="mt-2 text-xs text-foreground-muted">{search ? '试试好友的昵称或 ID。' : '在对方主页点亮收藏，下次相遇更容易。'}</p>
      </div>}
    </div>}
  </section>;
}
