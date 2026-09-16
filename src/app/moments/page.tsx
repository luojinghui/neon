'use client';

import { LoadingOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { getMoments } from './client';
import { MomentCard } from './components/MomentCard';
import { MomentComposer } from './components/MomentComposer';
import type { Moment } from './types';
import './moments.css';

export default function MomentsPage() {
  const [items, setItems] = useState<Moment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const scrollRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setLoading(true);
    setError('');
    try {
      const result = await getMoments({ page: 1, pageSize: 12 });
      if (request !== requestRef.current) return;
      setItems(result.items);
      setPage(1);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (loadError) {
      if (request === requestRef.current) setError(loadError instanceof Error ? loadError.message : '心迹加载失败');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const loadMore = async () => {
    if (!hasMore || loading || loadingMoreRef.current) return;
    const request = requestRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError('');
    try {
      const nextPage = page + 1;
      const result = await getMoments({ page: nextPage, pageSize: 12 });
      if (request !== requestRef.current) return;
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setPage(nextPage);
      setHasMore(result.hasMore);
      setTotal(result.total);
    } catch (loadError) {
      if (request === requestRef.current) setError(loadError instanceof Error ? loadError.message : '更多心迹加载失败');
    } finally {
      if (request === requestRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  return (
    <div className="app-screen flex w-full flex-col overflow-hidden bg-background">
      <TopBar
        middle="心迹"
        backHref="/"
        backLabel="首页"
        right={
          <div className="flex items-center gap-2">
            <ProfileShortcut returnTo="/moments" />
            <ThemeToggle />
          </div>
        }
      />

      <main ref={scrollRef} className="chat-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-10 pt-20">
        <div className="moment-page-layout">
          <section aria-label="心迹时间流" aria-busy={loading}>
            <div className="moment-page-heading">
              <div className="flex min-w-0 items-baseline gap-3">
                <h1>最新心迹</h1>
                <span className="text-xs text-foreground-muted">{loading && items.length === 0 ? '加载中…' : `${total} 条`}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="moment-icon-button" onClick={() => void load()} disabled={loading || loadingMore} aria-label="刷新心迹" title="刷新心迹">
                  {loading ? <LoadingOutlined /> : <ReloadOutlined />}
                </button>
                <button type="button" className="moment-primary-button" onClick={() => setComposerOpen(true)}><PlusOutlined />发布心迹</button>
              </div>
            </div>

            {loading && items.length === 0 ? (
              <div className="moment-feed-grid" aria-label="正在加载心迹">
                {[0, 1, 2, 3].map((index) => <div key={index} className="moment-card-skeleton"><div /><div /><div /></div>)}
              </div>
            ) : error && items.length === 0 ? (
              <div className="moment-empty-state" role="alert">
                <span>心迹加载失败</span>
                <p>{error}</p>
                <button type="button" onClick={() => void load()}><ReloadOutlined />重试</button>
              </div>
            ) : items.length === 0 ? (
              <div className="moment-empty-state">
                <span>还没有心迹</span>
                <p>记录此刻的文字、照片或声音。</p>
                <button type="button" onClick={() => setComposerOpen(true)}><PlusOutlined />发布心迹</button>
              </div>
            ) : (
              <div className="moment-feed-grid">
                {items.map((moment) => <MomentCard key={moment.id} moment={moment} onDeleted={(id) => {
                  setItems((current) => current.filter((item) => item.id !== id));
                  setTotal((value) => Math.max(0, value - 1));
                  // Deletion shifts offset pagination; invalidate older requests and reload page one.
                  void load();
                }} />)}
              </div>
            )}

            {items.length > 0 && hasMore && (
              <button type="button" className="moment-load-more" onClick={() => void loadMore()} disabled={loading || loadingMore}>{loadingMore && <LoadingOutlined />}{loadingMore ? '加载中…' : '查看更多心迹'}</button>
            )}
            {error && items.length > 0 && <p className="moment-inline-error mt-4" role="alert">{error}</p>}
          </section>
        </div>
      </main>

      <MomentComposer open={composerOpen} onClose={() => setComposerOpen(false)} onPublished={(moment) => {
        setItems((current) => [moment, ...current.filter((item) => item.id !== moment.id)]);
        setTotal((value) => value + 1);
        scrollRef.current?.scrollTo({ top: 0 });
        void load();
      }} />
    </div>
  );
}
