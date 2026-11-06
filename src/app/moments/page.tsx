'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { Suspense, useRef, useState } from 'react';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { refreshMomentFeed, useMomentFeed } from './useMomentFeed';
import { MomentCard } from './components/MomentCard';
import { MomentComposer } from './components/MomentComposer';
import { MomentFeed } from './components/MomentFeed';
import { MomentPermalink } from './components/MomentPermalink';

import './moments.css';
import './moments-journal.css';

export default function MomentsPage() {
  const { data, loading: refreshing, loadingMore, error } = useMomentFeed();
  const items = data?.items || [];
  const hasMore = data?.hasMore || false;
  const loading = refreshing || (!data && !error);
  const [composerOpen, setComposerOpen] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const load = () => refreshMomentFeed();
  const loadMore = () => refreshMomentFeed(true);
  return (
    <div className="moments-screen app-screen flex w-full flex-col overflow-hidden bg-background">
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

      <main ref={scrollRef} className="moment-scroll-area chat-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="app-content-width">
          <Suspense fallback={null}><MomentPermalink /></Suspense>
          <header className="moment-journal-intro">
            <div className="moment-journal-top">
              <div className="moment-journal-copy">
                <h1>星尘日记</h1>
              </div>
              <div className="moment-journal-art" aria-hidden="true"><PlanetIllustration size="md" /></div>
            </div>
            <div className="moment-journal-actions" role="group" aria-label="心迹操作">
              <button type="button" className="moment-journal-prompt" onClick={() => setComposerOpen(true)}>
                <Icon name="edit" />
                <span className="moment-journal-prompt-text">此刻在想什么？</span>
                <em>创作</em>
              </button>
              <Button variant="ghost" type="button" icon={<Icon name={loading ? 'loading' : 'refresh'} />} onClick={() => void load()} disabled={loading || loadingMore} aria-label="刷新心迹" aria-busy={loading || loadingMore || undefined} />
            </div>
          </header>

          <section className="moment-feed-section" aria-label="心迹时间流" aria-busy={loading}>
            {loading && items.length === 0 ? (
              <div className="moment-feed-grid" aria-label="正在加载心迹">
                {[0, 1, 2].map((index) => <Card as="div" key={index} padding="none" bodyWrap={false} className="moment-card-skeleton" aria-hidden="true"><div /><div /><div /></Card>)}
              </div>
            ) : error && items.length === 0 ? (
              <div className="moment-empty-state" role="alert">
                <span>心迹加载失败</span>
                <p>{error}</p>
                <Button variant="ghost" type="button" onClick={() => void load()}><Icon name="refresh" />重试</Button>
              </div>
            ) : items.length === 0 ? (
              <div className="moment-empty-state">
                <Icon name="edit" className="moment-empty-icon" />
                <span>还没有心迹</span>
                <p>平凡的日常，也有值得留下的片刻。</p>
                <Button variant="primary" type="button" onClick={() => setComposerOpen(true)}><Icon name="plus" />创作</Button>
              </div>
            ) : (
              <MomentFeed>
                {items.map((moment) => <MomentCard key={moment.id} moment={moment} onDeleted={() => { void refreshMomentFeed(false, true); }} />)}
              </MomentFeed>
            )}

            {items.length > 0 && hasMore && (
              <Button variant="outline" type="button" className="moment-load-more" onClick={() => void loadMore()} disabled={loading || loadingMore}>{loadingMore ? <Icon name="loading" /> : <Icon name="arrow-down" />}{loadingMore ? '加载中…' : '查看更多'}</Button>
            )}
            {items.length > 0 && !hasMore && !loading && !error && <p className="moment-feed-end">已看完全部心迹</p>}
            {error && items.length > 0 && <p className="moment-inline-error mt-4" role="alert">{error}</p>}
          </section>
        </div>
      </main>

      <MomentComposer appearance="journal" open={composerOpen} onClose={() => setComposerOpen(false)} onPublished={() => {
        scrollRef.current?.scrollTo({ top: 0 });
        void refreshMomentFeed(false, true);
      }} />
    </div>
  );
}
