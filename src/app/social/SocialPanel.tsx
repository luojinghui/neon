'use client';

import Link from 'next/link';
import { Badge } from 'antd';
import { useState } from 'react';
import { createProfileHref } from '../profile/navigation';
import { ContactActions } from './ContactActions';
import { refreshSocial, useSocialStore } from './client';

export function SocialPanel({ section }: { section: 'messages' | 'friends' }) {
  const { conversations, favorites, error, ready } = useSocialStore();
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const search = query.trim().toLowerCase();
  const items = conversations.filter((item) => `${item.peer.name} ${item.peer.userId} ${item.lastMessage?.content || ''}`.toLowerCase().includes(search));
  const friends = favorites.filter((item) => `${item.name} ${item.userId}`.toLowerCase().includes(search));
  return <section className="pt-5" aria-label={section === 'messages' ? '我的私信列表' : '我的好友收藏'}>
    <div className="mb-4 flex flex-wrap gap-2">
      <input aria-label="搜索私信或好友" placeholder="搜索昵称、ID 或私信内容" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <button type="button" onClick={() => void refreshSocial()} className="rounded-lg px-3 py-2 text-sm text-primary">刷新</button>
    </div>
    {section === 'friends' && <form className="mb-4 flex gap-2" onSubmit={(event) => event.preventDefault()}>
      <input aria-label="查找用户 ID" placeholder="输入用户 ID，查看主页并收藏" value={userId} onChange={(event) => setUserId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <Link href={userId.trim() ? createProfileHref(userId.trim(), { returnTo: '/profile' }) : '#'} aria-disabled={!userId.trim()} className="rounded-lg px-3 py-2 text-sm text-primary">查找用户</Link>
    </form>}
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    {!ready && !error && <p role="status" className="py-6 text-sm text-foreground-muted">正在加载…</p>}
    {section === 'messages' ? <div className="divide-y divide-border">
      {items.map((item) => <Link key={item.id} href={`/soul/${encodeURIComponent(item.id)}`} className="flex items-center gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-surface-hover">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg text-primary">{item.peer.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{item.peer.name}</span><time className="shrink-0 text-xs text-foreground-muted">{new Date(item.lastMessageAt || item.createdAt).toLocaleDateString('zh-CN')}</time></div><p className="mt-1 truncate text-sm text-foreground-muted">{item.lastMessage ? (item.lastMessage.type === 'text' ? item.lastMessage.content : `[${item.lastMessage.type === 'file' ? '文件' : '图片'}] ${item.lastMessage.content}`) : '开始聊天吧'}</p></div>
        <Badge count={item.unreadCount} overflowCount={99} />
      </Link>)}
      {ready && items.length === 0 && <p className="py-8 text-center text-sm text-foreground-muted">{search ? '没有匹配的私信' : '还没有私信，到用户主页发起聊天吧。'}</p>}
    </div> : <div className="divide-y divide-border">
      {friends.map((contact) => <div key={contact.publicKey} className="flex flex-wrap items-center justify-between gap-3 py-3"><Link href={createProfileHref(contact.userId, { publicKey: contact.publicKey, returnTo: '/profile' })} className="min-w-0"><span className="font-medium">{contact.name}</span><p className="text-xs text-foreground-muted">@{contact.userId}</p></Link><ContactActions contact={contact} /></div>)}
      {ready && friends.length === 0 && <p className="py-8 text-center text-sm text-foreground-muted">{search ? '没有匹配的好友' : '收藏好友后，可以在这里快速找到对方。'}</p>}
    </div>}
  </section>;
}
