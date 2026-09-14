'use client';

import { AudioOutlined, EnvironmentOutlined, LoadingOutlined, PictureOutlined, PlusOutlined, ReloadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import { ensureCurrentProfile } from '@/app/profile/client';
import { createProfileHref } from '@/app/profile/navigation';
import { getProfileAvatar, type CurrentProfile } from '@/app/profile/types';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { getMoments } from './client';
import { MomentCard } from './components/MomentCard';
import { MomentComposer } from './components/MomentComposer';
import type { Moment } from './types';
import './moments.css';

export default function MomentsPage() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [items, setItems] = useState<Moment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [current, result] = await Promise.all([ensureCurrentProfile(), getMoments({ page: 1, pageSize: 12 })]);
      setProfile(current);
      setItems(result.items);
      setPage(1);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setIsAdmin(result.isAdmin);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '心迹加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const nextPage = page + 1;
      const result = await getMoments({ page: nextPage, pageSize: 12 });
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setPage(nextPage);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setIsAdmin(result.isAdmin);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '更多心迹加载失败');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="app-screen flex w-full flex-col overflow-hidden bg-background">
      <TopBar
        middle={<span className="inline-flex items-center gap-2 text-lg font-medium"><span className="text-primary">✦</span>心迹</span>}
        backHref="/"
        backLabel="首页"
        right={
          <div className="flex items-center gap-2">
            <ProfileShortcut returnTo="/moments" />
            <ThemeToggle />
          </div>
        }
      />

      <main className="chat-scrollbar flex-1 overflow-y-auto px-3 pb-16 pt-20 sm:px-5 sm:pt-24">
        <div className="moment-page-layout">
          <section className="min-w-0" aria-label="心迹时间流">
            <div className="moment-page-heading">
              <div>
                <div className="moment-kicker">LATEST MOMENTS</div>
                <h1>看看大家的此刻</h1>
                <p>按发布时间从新到旧排列，共 {total} 条心迹</p>
              </div>
              <button type="button" className="moment-primary-button" onClick={() => setComposerOpen(true)}><PlusOutlined />分享此刻</button>
            </div>

            <button type="button" className="moment-quick-compose" onClick={() => setComposerOpen(true)}>
              {profile ? <Image src={getProfileAvatar(profile)} alt="" width={42} height={42} unoptimized className="h-[42px] w-[42px] rounded-full bg-surface-active object-cover" /> : <span className="h-[42px] w-[42px] animate-pulse rounded-full bg-background-tertiary" />}
              <span>今天心里是什么天气？</span>
              <span className="moment-quick-tools"><PictureOutlined /><VideoCameraOutlined /><AudioOutlined /><EnvironmentOutlined /></span>
            </button>

            {loading ? (
              <div className="grid gap-5">
                {[0, 1].map((index) => <div key={index} className="moment-card-skeleton"><div /><div /><div /></div>)}
              </div>
            ) : error && items.length === 0 ? (
              <div className="moment-empty-state">
                <span>暂时没能接收到大家的心迹</span>
                <p>{error}</p>
                <button type="button" onClick={() => void load()}><ReloadOutlined />重试</button>
              </div>
            ) : items.length === 0 ? (
              <div className="moment-empty-state">
                <span>这里还很安静</span>
                <p>发布第一条心迹，让此刻开始流动。</p>
                <button type="button" onClick={() => setComposerOpen(true)}><PlusOutlined />分享此刻</button>
              </div>
            ) : (
              <div className="grid gap-5">
                {items.map((moment) => <MomentCard key={moment.id} moment={moment} onDeleted={(id) => { setItems((current) => current.filter((item) => item.id !== id)); setTotal((value) => Math.max(0, value - 1)); }} />)}
              </div>
            )}

            {items.length > 0 && hasMore && (
              <button type="button" className="moment-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore && <LoadingOutlined />}{loadingMore ? '加载中…' : '查看更多心迹'}</button>
            )}
            {error && items.length > 0 && <p className="moment-inline-error mt-4" role="alert">{error}</p>}
          </section>

          <aside className="moment-page-aside">
            {profile && (
              <Link href={createProfileHref(profile.userId, { returnTo: '/moments' })} className="moment-aside-profile">
                <Image src={getProfileAvatar(profile)} alt="" width={46} height={46} unoptimized className="h-[46px] w-[46px] rounded-full bg-surface-active object-cover" />
                <span><strong>{profile.name}</strong><small>@{profile.userId}</small></span>
              </Link>
            )}
            {isAdmin && <div className="moment-admin-badge">超级管理员视角</div>}
            <p>把转瞬即逝的心情，留在你的星球轨道上。</p>
            <button type="button" className="moment-secondary-button" onClick={() => setComposerOpen(true)}><PlusOutlined />发布新心迹</button>
            <div className="moment-aside-capabilities">
              <span>按发布时间排序</span>
              <span>文字 · 图片 · 视频</span>
              <span>语音 · H5 位置</span>
            </div>
          </aside>
        </div>
      </main>

      <MomentComposer open={composerOpen} onClose={() => setComposerOpen(false)} onPublished={(moment) => { setItems((current) => [moment, ...current]); setTotal((value) => value + 1); }} />
    </div>
  );
}
