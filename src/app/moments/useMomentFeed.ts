'use client';

import { useEffect } from 'react';
import { getOrCreateIdentity, PROFILE_CHANGED_EVENT } from '@/app/profile/client';
import { subscribeAdminSessionChanges } from '@/app/admin/sessionEvents';
import { getMoments } from './client';
import { MOMENT_PAGE_SIZE, replaceMomentFeed, restoreMomentFeed, updateMomentFeed, useMomentFeedStore } from './feedCache';

let pending: { owner: string; promise: Promise<void> } | null = null;

export async function refreshMomentFeed(append = false, silent = false): Promise<void> {
  const owner = getOrCreateIdentity().uuid;
  restoreMomentFeed(owner);
  if (pending?.owner === owner) return pending.promise;
  const { data, version } = useMomentFeedStore.getState();
  if (append && !data?.hasMore) return;
  useMomentFeedStore.setState({ loading: !append && (!silent || !data), loadingMore: append, error: '' });
  const request = { owner, promise: Promise.resolve() };
  pending = request;
  request.promise = (async () => {
    try {
      const page = append ? (data?.page || 1) + 1 : 1;
      // Revalidate the loaded range so returning to the page keeps pagination.
      const pages = append ? [page] : Array.from({ length: data?.page || 1 }, (_, index) => index + 1);
      const results = await Promise.all(pages.map(page => getMoments({ page, pageSize: MOMENT_PAGE_SIZE })));
      const first = results[0];
      const lastPage = append ? page : Math.min(pages.length, Math.max(1, Math.ceil(first.total / MOMENT_PAGE_SIZE)));
      const items = [...(append ? data?.items || [] : []), ...results.flatMap(result => result.items)];
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      replaceMomentFeed(owner, version, { ...first, items: unique, page: lastPage, hasMore: lastPage * MOMENT_PAGE_SIZE < first.total });
    } catch (error) {
      const current = useMomentFeedStore.getState();
      if (current.owner === owner && current.version === version && (!silent || !current.data)) useMomentFeedStore.setState({ error: error instanceof Error ? error.message : '心迹加载失败' });
    } finally {
      if (pending === request) {
        pending = null;
        const current = useMomentFeedStore.getState();
        if (current.owner === owner) {
          useMomentFeedStore.setState({ loading: false, loadingMore: false });
          // A mutation that finished during this fetch takes precedence. Fetch
          // again to refill shifted pages instead of restoring an older response.
          if (current.version !== version) void refreshMomentFeed(false, true);
        }
      }
    }
  })();
  return request.promise;
}

export function useMomentFeed() {
  const state = useMomentFeedStore();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void refreshMomentFeed(false, true); };
    const refreshPermissions = () => {
      const owner = useMomentFeedStore.getState().owner;
      updateMomentFeed(owner, data => ({ ...data, isAdmin: false, items: data.items.map(item => ({ ...item, canDelete: item.isOwner })) }));
      refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    const unsubscribe = subscribeAdminSessionChanges(refreshPermissions);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    };
  }, []);
  return state;
}
