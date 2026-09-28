'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { openDirect, setFavorite, useSocialStore, type Contact } from './client';

export function ContactActions({ contact, showMessage = true, compact = false }: { contact: Contact; showMessage?: boolean; compact?: boolean }) {
  const router = useRouter();
  const favorite = useSocialStore((state) => state.favorites.some((item) => item.publicKey === contact.publicKey));
  const ready = useSocialStore((state) => state.ready);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const act = async (action: 'favorite' | 'message') => {
    if (pending) return;
    setPending(true); setError('');
    try {
      if (action === 'favorite') await setFavorite(contact.publicKey, !favorite);
      else router.push(await openDirect(contact.publicKey));
    } catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试'); }
    finally { setPending(false); }
  };
  return <div className={`${compact ? 'max-w-36 justify-end' : 'my-3'} flex shrink-0 flex-wrap items-center gap-2`}>
    <button type="button" disabled={!ready || pending} aria-label={favorite ? '取消收藏好友' : '收藏好友'} title={favorite ? '取消收藏好友' : '收藏好友'} aria-pressed={favorite} onClick={() => void act('favorite')} className={`${compact ? 'h-9 w-9 justify-center rounded-full text-foreground-muted' : 'gap-2 rounded-full border border-border px-3 py-2 text-sm'} inline-flex items-center hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}>{favorite ? <StarFilled className="text-primary" /> : <StarOutlined />}{!compact && (favorite ? '已收藏好友' : '收藏好友')}</button>
    {showMessage && <button type="button" disabled={!ready || pending} onClick={() => void act('message')} className={`${compact ? 'h-9 bg-background-secondary px-3 text-xs text-foreground-secondary hover:bg-surface-active' : 'bg-primary px-4 py-2 text-sm text-white hover:bg-primary-hover'} inline-flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}><MessageOutlined />{compact ? '私信' : '发私信'}</button>}
    {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
  </div>;
}
