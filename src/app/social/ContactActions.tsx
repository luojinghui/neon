'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { openDirect, setFavorite, useSocialStore, type Contact } from './client';

export function ContactActions({ contact, showMessage = true }: { contact: Contact; showMessage?: boolean }) {
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
  return <div className="my-3 flex flex-wrap items-center gap-2">
    <button type="button" disabled={!ready || pending} aria-pressed={favorite} onClick={() => void act('favorite')} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">{favorite ? <StarFilled className="text-primary" /> : <StarOutlined />}{favorite ? '已收藏好友' : '收藏好友'}</button>
    {showMessage && <button type="button" disabled={!ready || pending} onClick={() => void act('message')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-hover disabled:opacity-50"><MessageOutlined />发私信</button>}
    {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
  </div>;
}
