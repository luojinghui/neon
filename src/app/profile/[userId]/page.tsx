'use client';

import { AppstoreOutlined, CheckOutlined, CopyOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
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
import { ProfileBannerView } from '../components/ProfileBanner';
import { ProfileEditor } from '../components/ProfileEditor';
import { getProfileAvatar, type PublicProfile } from '../types';
import { createProfileHref, getProfileBackLabel, sanitizeProfileReturnTo } from '../navigation';

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
  const [editorOpen, setEditorOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'moments'>('profile');
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
    setEditorOpen(false);
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
  }, [publicKey, returnTo, router, userId]);

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
    <div className="app-screen flex w-full flex-col bg-background">
      <TopBar
        middle="个人主页"
        backHref={returnTo}
        backLabel={getProfileBackLabel(returnTo)}
        right={
          <div className="flex items-center gap-2">
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
        <div className="app-content-width">
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
            <article className="overflow-hidden rounded-2xl border border-border bg-surface">
              <ProfileBannerView banner={profile.banner} className="h-40 sm:h-56 lg:h-60" />

              <div className="relative px-5 pb-6 sm:px-7 sm:pb-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="relative -mt-14 h-28 w-28 shrink-0 sm:-mt-16 sm:h-32 sm:w-32">
                    <ImagePreview images={[{ id: 'avatar', url: getProfileAvatar(profile), name: `${profile.name}的头像` }]} imageId="avatar" className="relative h-full w-full rounded-full" title="头像">
                    <Image
                      src={getProfileAvatar(profile)}
                      alt={`${profile.name}的头像`}
                      fill
                      sizes="128px"
                      priority
                      unoptimized
                      className="rounded-full border-[5px] border-surface bg-surface-active object-cover"
                    />
                    </ImagePreview>
                    {isOwner && <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-surface bg-success" title="这是你" />}
                  </div>

                  {isOwner && !profile.isSystem && (
                    <div className="mb-1 mt-4 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setEditorOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover">
                        <EditOutlined /> 编辑资料
                      </button>
                      <button type="button" onClick={() => setComposerOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">
                        <PlusOutlined /> 发布心迹
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{profile.name}</h1>
                    {profile.isSystem && <span className="rounded-full bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">官方</span>}
                  </div>
                  <div className="mt-1.5 font-mono text-sm text-foreground-muted">@{profile.userId}</div>
                  <p className={`mt-5 whitespace-pre-wrap text-[15px] leading-7 ${profile.bio ? 'text-foreground-secondary' : 'italic text-foreground-muted'}`}>
                    {profile.bio || (isOwner ? '还没有写个人描述，留一句此刻想说的话吧。' : '这个人还没有留下个人描述。')}
                  </p>
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex gap-2" role="group" aria-label="个人主页内容">
                    <button
                      type="button"
                      onClick={() => setActiveSection('profile')}
                      aria-pressed={activeSection === 'profile'}
                      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors ${activeSection === 'profile' ? 'bg-primary-soft font-medium text-primary' : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'}`}
                    >
                      <UserOutlined /> 资料
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection('moments')}
                      aria-pressed={activeSection === 'moments'}
                      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors ${activeSection === 'moments' ? 'bg-primary-soft font-medium text-primary' : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'}`}
                    >
                      <AppstoreOutlined /> 心迹
                      {momentsLoaded && <span className="text-xs text-foreground-muted">{moments.length}</span>}
                    </button>
                  </div>

                  {activeSection === 'profile' ? (
                    <div className="grid gap-x-10 gap-y-6 pb-1 pt-6 sm:grid-cols-2">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">✦</div>
                        <div><div className="text-sm font-medium text-foreground">星球旅程</div><div className="mt-1 text-xs leading-relaxed text-foreground-muted">{formatJoinedDate(profile.createdAt)}</div></div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">@</div>
                        <div><div className="text-sm font-medium text-foreground">专属 ID</div><div className="mt-1 font-mono text-xs leading-relaxed text-foreground-muted">@{profile.userId}</div></div>
                      </div>
                    </div>
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
              </div>
            </article>
          )}
        </div>
      </main>

      {profile && isOwner && !profile.isSystem && (
        <>
          <ProfileEditor
            open={editorOpen}
            profile={profile}
            onClose={() => setEditorOpen(false)}
            onSaved={(updated) => {
              setProfile(updated);
              setEditorOpen(false);
              if (updated.userId !== userId) router.replace(createProfileHref(updated.userId, { returnTo }));
            }}
          />
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
