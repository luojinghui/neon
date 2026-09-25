'use client';

import { ArrowDownOutlined, EditOutlined, LoadingOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { refreshMomentFeed, useMomentFeed } from './useMomentFeed';
import { MomentCard } from './components/MomentCard';
import { MomentComposer } from './components/MomentComposer';
import { MomentFeed } from './components/MomentFeed';

import './moments.css';
import './moments-journal.css';

export default function MomentsPage() {
  const { data, loading: refreshing, loadingMore, error } = useMomentFeed();
  const items = data?.items || [];
  const total = data?.total || 0;
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
          <header className="moment-journal-intro">
            <div>
              <h1>让此刻，留下回响。</h1>
              <p className="moment-journal-description">用文字、照片和声音，收藏生活里的微光。</p>
            </div>
            <button type="button" className="moment-primary-button" onClick={() => setComposerOpen(true)}><EditOutlined />发布心迹</button>
          </header>

          <section className="moment-feed-section" aria-label="心迹时间流" aria-busy={loading}>
            <div className="moment-page-heading">
              <div className="moment-feed-label">
                <h2>最新心迹</h2>
                <span>{loading && items.length === 0 ? '加载中…' : `${total} 条`}</span>
              </div>
              <button type="button" className="moment-refresh-button" onClick={() => void load()} disabled={loading || loadingMore} aria-label="刷新心迹">
                {loading ? <LoadingOutlined /> : <ReloadOutlined />}<span>刷新</span>
              </button>
            </div>

            {loading && items.length === 0 ? (
              <div className="moment-feed-grid" aria-label="正在加载心迹">
                {[0, 1, 2].map((index) => <div key={index} className="moment-card-skeleton" aria-hidden="true"><div /><div /><div /></div>)}
              </div>
            ) : error && items.length === 0 ? (
              <div className="moment-empty-state" role="alert">
                <span>心迹加载失败</span>
                <p>{error}</p>
                <button type="button" onClick={() => void load()}><ReloadOutlined />重试</button>
              </div>
            ) : items.length === 0 ? (
              <div className="moment-empty-state">
                <EditOutlined className="moment-empty-icon" aria-hidden="true" />
                <span>还没有心迹</span>
                <p>平凡的日常，也有值得留下的片刻。</p>
                <button type="button" onClick={() => setComposerOpen(true)}><PlusOutlined />发布心迹</button>
              </div>
            ) : (
              <MomentFeed>
                {items.map((moment) => <MomentCard key={moment.id} moment={moment} onDeleted={() => { void refreshMomentFeed(false, true); }} />)}
              </MomentFeed>
            )}

            {items.length > 0 && hasMore && (
              <button type="button" className="moment-load-more" onClick={() => void loadMore()} disabled={loading || loadingMore}>{loadingMore ? <LoadingOutlined /> : <ArrowDownOutlined />}{loadingMore ? '加载中…' : '查看更多心迹'}</button>
            )}
            {items.length > 0 && !hasMore && !loading && !error && <p className="moment-feed-end">此刻的心迹，都在这里了</p>}
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
