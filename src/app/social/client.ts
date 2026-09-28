'use client';

import { create } from 'zustand';
import { SocketChatTransport } from '../soul/core/socketTransport';
import { ensureCurrentProfile } from '../profile/client';
import type { ServerChatMessage } from '../soul/core/types';

export type Contact = { publicKey: string; userId: string; name: string; avatarUrl: string };
export type Conversation = {
  id: string; peer: Contact; participants: Contact[]; createdAt: string;
  lastMessageAt: string | null; lastMessage: ServerChatMessage | null; messageCount: number; unreadCount: number;
};
type SocialData = { conversations: Conversation[]; favorites: Contact[] };
export const useSocialStore = create<SocialData & { ready: boolean; error: string }>(() => ({ conversations: [], favorites: [], ready: false, error: '' }));
let transport: SocketChatTransport | null = null;
let requestVersion = 0;

export async function refreshSocial() {
  const current = transport;
  if (!current) return;
  const version = ++requestVersion;
  try {
    const data = await current.emitWithAck<SocialData>('social:list');
    if (current === transport && version === requestVersion) useSocialStore.setState({ ...data, ready: true, error: '' });
  } catch (error) {
    if (current === transport && version === requestVersion) useSocialStore.setState({ error: error instanceof Error ? error.message : '私信加载失败' });
  }
}

export function connectSocial(): () => void {
  const current = new SocketChatTransport();
  transport = current;
  let active = true;
  let connecting = false;
  let bound = false;
  const unsubscribers: Array<() => void> = [];
  const connect = async () => {
    if (connecting || !active) return;
    connecting = true;
    try {
      const profile = await ensureCurrentProfile();
      if (!active) return;
      await current.connect(profile);
      if (!active) return;
      if (!bound) {
        bound = true;
        unsubscribers.push(current.onSocialChanged(() => void refreshSocial()), current.onConnectionChange((connected) => {
          if (connected) void refreshSocial();
          else useSocialStore.setState({ ready: false, error: '连接已断开，正在重连…' });
        }));
      }
      await refreshSocial();
    } catch (error) {
      if (active) useSocialStore.setState({ ready: false, error: error instanceof Error ? error.message : '私信连接失败' });
    } finally { connecting = false; }
  };
  const refresh = () => { if (document.visibilityState === 'visible') void connect(); };
  void connect();
  const timer = window.setInterval(refresh, 30_000);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    active = false;
    window.clearInterval(timer);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', refresh);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    current.disconnect();
    if (transport === current) transport = null;
  };
}

export async function openDirect(publicKey: string): Promise<string> {
  if (!transport) throw new Error('私信服务正在连接，请稍后重试');
  const result = await transport.emitWithAck<{ roomId: string }>('direct:open', { publicKey });
  return `/soul/${encodeURIComponent(result.roomId)}`;
}

export async function setFavorite(publicKey: string, favorite: boolean) {
  if (!transport) throw new Error('好友服务正在连接，请稍后重试');
  await transport.emitWithAck<Contact[]>('favorite:set', { publicKey, favorite });
  await refreshSocial();
}
