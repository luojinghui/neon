'use client';

import { create } from 'zustand';
import type { Moment, MomentListResponse } from './types';

const PREFIX = 'neon:moment-feed:v1:';
export const MOMENT_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
export const MOMENT_PAGE_SIZE = 12;
type FeedState = { owner: string; data: MomentListResponse | null; version: number; loading: boolean; loadingMore: boolean; error: string };
export const useMomentFeedStore = create<FeedState>(() => ({ owner: '', data: null, version: 0, loading: false, loadingMore: false, error: '' }));

export function readMomentFeedCache(owner: string, storage: Pick<Storage, 'getItem' | 'removeItem'> = localStorage): MomentListResponse | null {
  try {
    const cached = JSON.parse(storage.getItem(PREFIX + owner) || 'null');
    if (!cached) return null;
    const { data, savedAt } = cached;
    if (cached.owner !== owner || !Number.isFinite(savedAt) || Date.now() - savedAt > MOMENT_CACHE_MAX_AGE || savedAt > Date.now() + 60_000
      || !data || data.page !== 1 || data.pageSize !== MOMENT_PAGE_SIZE || !Number.isInteger(data.total) || data.total < 0 || typeof data.hasMore !== 'boolean'
      || !Array.isArray(data.items) || !data.items.every((item: Moment) => item && typeof item.id === 'string' && typeof item.text === 'string'
        && typeof item.createdAt === 'string' && item.author && typeof item.author.name === 'string' && typeof item.author.userId === 'string'
        && Array.isArray(item.media) && item.media.every(media => media && ['image', 'video'].includes(media.type) && typeof media.url === 'string')
        && Array.isArray(item.comments) && typeof item.commentCount === 'number' && typeof item.likeCount === 'number'
        && (!item.voice || typeof item.voice.url === 'string') && (!item.location || typeof item.location.label === 'string'))) throw new Error('Invalid moment cache');
    // Admin cookies may have expired since this snapshot was saved.
    return { ...data, isAdmin: false, items: data.items.map((item: Moment) => ({ ...item, canDelete: item.isOwner === true, comments: [] })) };
  } catch {
    try { storage.removeItem(PREFIX + owner); } catch { /* Storage is optional. */ }
    return null;
  }
}

function persist() {
  const { owner, data } = useMomentFeedStore.getState();
  if (!owner || !data) return;
  // Keep a bounded first page on disk; all loaded pages remain in memory.
  const snapshot = { ...data, items: data.items.slice(0, MOMENT_PAGE_SIZE), page: 1, pageSize: MOMENT_PAGE_SIZE, hasMore: data.total > MOMENT_PAGE_SIZE };
  try { localStorage.setItem(PREFIX + owner, JSON.stringify({ owner, savedAt: Date.now(), data: snapshot })); } catch { /* In-memory cache remains available. */ }
}

export function restoreMomentFeed(owner: string) {
  const state = useMomentFeedStore.getState();
  if (state.owner === owner) return;
  let data: MomentListResponse | null = null;
  try { data = readMomentFeedCache(owner); } catch { /* Storage may be disabled. */ }
  useMomentFeedStore.setState({ owner, data, version: state.version + 1, loading: false, loadingMore: false, error: '' });
}

export function updateMomentFeed(owner: string, update: (data: MomentListResponse) => MomentListResponse) {
  const state = useMomentFeedStore.getState();
  if (state.owner !== owner) return;
  useMomentFeedStore.setState({ data: state.data ? update(state.data) : null, version: state.version + 1 });
  persist();
}

export function patchCachedMoment(owner: string, id: string, update: (moment: Moment) => Moment) {
  updateMomentFeed(owner, data => ({ ...data, items: data.items.map(item => item.id === id ? update(item) : item) }));
}

export function replaceMomentFeed(owner: string, version: number, data: MomentListResponse) {
  const current = useMomentFeedStore.getState();
  if (current.owner !== owner || current.version !== version) return false;
  useMomentFeedStore.setState({ data, error: '' });
  persist();
  return true;
}
