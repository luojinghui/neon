import { create } from 'zustand';
import type { FileItem } from '../store';
import type { PlazaMessage } from './types';
import { loadPlaza } from './client';

export type TextHistoryItem = { text: string; timestamp: number };
type PlazaStore = {
  text: string; revision: number; files: FileItem[]; isDragging: boolean; isSending: boolean; uploadProgress: number;
  textHistory: TextHistoryItem[];
  items: PlazaMessage[]; nextCursor: string | null; loaded: boolean; busy: 'refresh' | 'more' | null; error: string | null; failedMore: boolean; clockOffset: number;
};

export const usePlazaStore = create<PlazaStore>(() => ({
  text: '', revision: 0, files: [], isDragging: false, isSending: false, uploadProgress: 0, textHistory: [],
  items: [], nextCursor: null, loaded: false, busy: null, error: null, failedMore: false, clockOffset: 0
}));

let feedVersion = 0;
const HISTORY_KEY = 'cloud_plaza_text_history';

export function setPlazaText(text: string) {
  usePlazaStore.setState(state => ({ text, revision: state.revision + 1 }));
}

export function readPlazaHistory() {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const items = Array.isArray(raw) ? raw.filter(item => typeof item?.text === 'string' && Number.isFinite(item?.timestamp)).slice(0, 20) : [];
    usePlazaStore.setState({ textHistory: items });
  } catch { usePlazaStore.setState({ textHistory: [] }); }
}

export function savePlazaHistory(items: TextHistoryItem[]) {
  usePlazaStore.setState({ textHistory: items });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* History is best-effort after a successful send. */ }
}

export function addPlazaMessage(item: PlazaMessage, serverNow: string) {
  feedVersion++;
  usePlazaStore.setState(state => ({
    items: [item, ...state.items.filter(current => current.messageId !== item.messageId)],
    clockOffset: Date.parse(serverNow) - Date.now()
  }));
}

export function removePlazaMessage(messageId: string) {
  feedVersion++;
  usePlazaStore.setState(state => ({ items: state.items.filter(item => item.messageId !== messageId) }));
}

export async function refreshPlaza(more = false) {
  const state = usePlazaStore.getState();
  if (state.busy || (more && !state.nextCursor)) return;
  const version = ++feedVersion;
  usePlazaStore.setState({ busy: more ? 'more' : 'refresh', error: null });
  try {
    const response = await loadPlaza(more ? state.nextCursor! : undefined);
    if (version !== feedVersion) return;
    const combined = more ? [...usePlazaStore.getState().items, ...response.items] : response.items;
    const seen = new Set<string>();
    const items = combined.filter(item => {
      if (seen.has(item.messageId) || Date.parse(item.expireAt) <= Date.parse(response.serverNow)) return false;
      seen.add(item.messageId);
      return true;
    });
    usePlazaStore.setState({ items, nextCursor: response.nextCursor, loaded: true, clockOffset: Date.parse(response.serverNow) - Date.now() });
  } catch (error) {
    if (version === feedVersion) usePlazaStore.setState({ error: error instanceof Error ? error.message : '加载失败，请重试', failedMore: more });
  } finally { usePlazaStore.setState({ busy: null }); }
}
