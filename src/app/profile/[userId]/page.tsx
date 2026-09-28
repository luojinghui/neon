'use client';

import { CheckOutlined, CopyOutlined, ReloadOutlined, CalendarOutlined, CompassOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { getAllMomentsForOwner } from '@/app/moments/client';
import { MomentComposer } from '@/app/moments/components/MomentComposer';
import { MomentGallery } from '@/app/moments/components/MomentGallery';
import type { Moment } from '@/app/moments/types';
import '@/app/moments/moments.css';
import { getPublicProfile } from '../client';
import { ProfileIdentity } from '../components/ProfileIdentity';
import type { PublicProfile } from '../types';
import { createProfileHref, getProfileBackLabel, sanitizeProfileReturnTo } from '../navigation';
import { SocialPanel } from '@/app/social/SocialPanel';
import { useSocialStore } from '@/app/social/client';
import { ProfileShortcut } from '../components/ProfileShortcut';
import '../profile.css';

function formatJoinedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚来到这里';
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月来到这里`;
}

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'moments' | 'messages' | 'friends'>('profile');
  const unread = useSocialStore((state) => state.conversations.reduce((total, item) => total + item.unreadCount, 0));
  const friendCount = useSocialStore((state) => state.favorites.length);
  const socialReady = useSocialStore((state) => state.ready);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const [momentsLoaded, setMomentsLoaded] = useState(false);
  const [momentsError, setMomentsError] = useState('');
  const momentsRequest = useRef(0);
  const momentsInFlight = useRef(false);
  const publishedMoments = useRef<Moment[]>([]);
  const deletedMoments = useRef(new Set<string>());
  const activeProfileKey = useRef('');
  const userId = decodeURIComponent(params.userId || '');
  const publicKey = searchParams.get('key') || '';
  const returnTo = sanitizeProfileReturnTo(searchParams.get('from'));
  const requestedSection = searchParams.get('section');

  useEffect(() => {
    let active = true;
    momentsRequest.current += 1;
    momentsInFlight.current = false;
    publishedMoments.current = [];
    deletedMoments.current.clear();
    activeProfileKey.current = '';
    setProfile(null);
    setIsOwner(false);
    setLoading(true);
    setError('');
    setComposerOpen(false);
    setActiveSection('profile');
    setMoments([]);
    setMomentsLoading(false);
    setMomentsLoaded(false);
    setMomentsError('');
    getPublicProfile(userId, publicKey)
      .then((result) => {
        if (!active) return;
        activeProfileKey.current = result.profile.publicKey;
        setProfile(result.profile);
        setIsOwner(result.isOwner);
        if (result.isOwner && requestedSection === 'messages') setActiveSection('messages');
        setLoading(false);
        if (result.profile.userId.toLowerCase() !== userId.toLowerCase()) {
          router.replace(createProfileHref(result.profile.userId, { returnTo }));
        }
      })
      .catch((profileError) => {
        if (!active) return;
        setError(profileError instanceof Error ? profileError.message : '个人资料加载失败');
        setLoading(false);
      });
    return () => {
      active = false;
      momentsRequest.current += 1;
      activeProfileKey.current = '';
    };
  }, [publicKey, returnTo, router, userId, requestedSection]);

  const copyProfileLink = async () => {
    if (!profile) return;
    const url = new URL(createProfileHref(profile.userId, { publicKey: profile.publicKey }), window.location.origin).href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const ownerUserId = profile?.userId;
  const loadMoments = useCallback(async () => {
    if (!ownerUserId || momentsInFlight.current) return;
    const request = ++momentsRequest.current;
    momentsInFlight.current = true;
    setMomentsLoading(true);
    setMomentsError('');
    try {
      const items = await getAllMomentsForOwner(ownerUserId);
      if (request !== momentsRequest.current) return;
      // Publishing while history is loading must preserve both the new item and older entries.
      const merged = new Map<string, Moment>();
      for (const moment of [...publishedMoments.current, ...items]) {
        if (!deletedMoments.current.has(moment.id) && !merged.has(moment.id)) merged.set(moment.id, moment);
      }
      setMoments([...merged.values()]);
      setMomentsLoaded(true);
    } catch (momentError) {
      if (request !== momentsRequest.current) return;
      setMomentsError(momentError instanceof Error ? momentError.message : '心迹加载失败');
    } finally {
      if (request === momentsRequest.current) {
        momentsInFlight.current = false;
        setMomentsLoading(false);
      }
    }
  }, [ownerUserId]);

  useEffect(() => {
    if (activeSection === 'moments' && !loading && !momentsLoaded && !momentsLoading && !momentsError) void loadMoments();
  }, [activeSection, loadMoments, loading, momentsError, momentsLoaded, momentsLoading]);

  return (
    <div className="profile-page app-screen flex w-full flex-col">
      <TopBar
        middle="个人主页"
        backHref={returnTo}
        backLabel={getProfileBackLabel(returnTo)}
        right={
          <div className="flex items-center gap-2">
            <ProfileShortcut returnTo={returnTo} />
            {profile && !loading && (
              <button
                type="button"
                onClick={() => void copyProfileLink()}
                className="app-icon-button"
                aria-label={copied ? '个人主页链接已复制' : '复制个人主页链接'}
                title={copied ? '已复制' : '分享个人主页'}
              >
                {copied ? <CheckOutlined className="text-success" /> : <CopyOutlined />}
              </button>
            )}
            <ThemeToggle />
          </div>
        }
      />

      <main className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden pb-12 pt-[var(--app-page-top)]">
        <div className="profile-shell">
          {loading ? (
            <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="h-40 bg-background-tertiary sm:h-56" />
              <div className="px-5 pb-8 sm:px-7">
                <div className="-mt-12 h-28 w-28 rounded-full border-4 border-surface bg-background-tertiary" />
                <div className="mt-4 h-7 w-44 rounded bg-background-tertiary" />
                <div className="mt-3 h-4 w-28 rounded bg-background-tertiary" />
                <div className="mt-6 h-4 w-3/5 rounded bg-background-tertiary" />
              </div>
            </div>
          ) : error || !profile ? (
            <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-surface px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">?</div>
              <h1 className="mt-5 text-xl font-semibold text-foreground">这颗星暂时没有主人</h1>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{error || '没有找到这个人的公开资料。'}</p>
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg bg-surface-hover px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover">
                  <ReloadOutlined /> 重试
                </button>
                <Link href="/soul" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                  去星球看看
                </Link>
              </div>
            </div>
          ) : (
            <article className="profile-card">
              <ProfileIdentity
                key={profile.publicKey}
                profile={profile}
                isOwner={isOwner}
                onCompose={() => setComposerOpen(true)}
                onSaved={(updated) => {
                  if (updated.publicKey !== activeProfileKey.current) return;
                  setProfile(updated);
                  if (updated.userId !== userId) router.replace(createProfileHref(updated.userId, { returnTo }));
                }}
              />
              <div className="profile-sections">
                <nav className="profile-tabs" aria-label="个人主页内容">
                  {([
                    { id: 'profile', label: '资料' },
                    { id: 'moments', label: '心迹' },
                    ...(isOwner ? [{ id: 'messages', label: '私信' }, { id: 'friends', label: '好友收藏' }] as const : [])
                  ] as const).map((section) => <button key={section.id} type="button" className="profile-tab" aria-pressed={activeSection === section.id} onClick={() => setActiveSection(section.id)}>
                    {section.label}
                    {section.id === 'moments' && momentsLoaded && moments.length > 0 && <span className="profile-tab-count">{moments.length}</span>}
                    {section.id === 'messages' && unread > 0 && <span className="profile-tab-unread">{unread > 99 ? '99+' : unread}</span>}
                    {section.id === 'friends' && socialReady && friendCount > 0 && <span className="profile-tab-count">{friendCount}</span>}
                  </button>)}
                </nav>

                {isOwner && (activeSection === 'messages' || activeSection === 'friends') ? <SocialPanel section={activeSection} /> : activeSection === 'profile' ? (
                  <dl className="profile-details">
                    <div className="profile-detail">
                      <span className="profile-detail-icon"><CalendarOutlined /></span>
                      <div><dt>星球旅程</dt><dd>{formatJoinedDate(profile.createdAt)}</dd></div>
                    </div>
                    <div className="profile-detail">
                      <span className="profile-detail-icon"><CompassOutlined /></span>
                      <div><dt>在这里，相遇</dt><dd>分享日常，也发现同频的人。<br /><Link href="/soul" className="text-foreground-secondary hover:text-primary">去星球逛逛 →</Link></dd></div>
                    </div>
                  </dl>
                ) : (
                    <MomentGallery
                      key={profile.publicKey}
                      moments={moments}
                      loading={momentsLoading}
                      error={momentsError}
                      onRetry={() => void loadMoments()}
                      onDeleted={(id) => {
                        deletedMoments.current.add(id);
                        setMoments((current) => current.filter((moment) => moment.id !== id));
                      }}
                    />
                )}
              </div>
            </article>
          )}
          {!loading && profile && !error && <p className="profile-footnote">每一颗星，都有自己的故事</p>}
        </div>
      </main>

      {profile && isOwner && !profile.isSystem && (
        <>
          <MomentComposer
            appearance="journal"
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            onPublished={(moment) => {
              if (moment.author.publicKey !== activeProfileKey.current) return;
              publishedMoments.current = [moment, ...publishedMoments.current.filter((item) => item.id !== moment.id)];
              setMoments((current) => [moment, ...current.filter((item) => item.id !== moment.id)]);
              setMomentsError('');
              setActiveSection('moments');
            }}
          />
        </>
      )}
    </div>
  );
}
