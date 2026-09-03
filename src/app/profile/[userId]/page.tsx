'use client';

import { CheckOutlined, CopyOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
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
  const [copied, setCopied] = useState(false);
  const userId = decodeURIComponent(params.userId || '');
  const publicKey = searchParams.get('key') || '';
  const returnTo = sanitizeProfileReturnTo(searchParams.get('from'));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getPublicProfile(userId, publicKey)
      .then((result) => {
        if (!active) return;
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
    };
  }, [publicKey, returnTo, router, userId]);

  const copyProfileLink = async () => {
    if (!profile) return;
    const url = new URL(createProfileHref(profile.userId, { publicKey: profile.publicKey }), window.location.origin).href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
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
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                aria-label="复制个人主页链接"
              >
                {copied ? <CheckOutlined className="text-success" /> : <CopyOutlined />}
                <span className="hidden sm:inline">{copied ? '已复制' : '分享'}</span>
              </button>
            )}
            <ThemeToggle />
          </div>
        }
      />

      <main className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-4 pb-12 pt-20 sm:pt-24">
        {loading ? (
          <div className="mx-auto max-w-screen-xl animate-pulse overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="h-48 bg-background-tertiary sm:h-64" />
            <div className="px-5 pb-8 sm:px-8">
              <div className="-mt-12 h-28 w-28 rounded-full border-4 border-surface bg-background-tertiary" />
              <div className="mt-4 h-7 w-44 rounded bg-background-tertiary" />
              <div className="mt-3 h-4 w-28 rounded bg-background-tertiary" />
              <div className="mt-6 h-4 w-3/5 rounded bg-background-tertiary" />
            </div>
          </div>
        ) : error || !profile ? (
          <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">?</div>
            <h1 className="mt-5 text-xl font-semibold text-foreground">这颗星暂时没有主人</h1>
            <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{error || '没有找到这个人的公开资料。'}</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover">
                <ReloadOutlined /> 重试
              </button>
              <Link href="/soul" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                去星球看看
              </Link>
            </div>
          </div>
        ) : (
          <article className="mx-auto max-w-screen-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
            <ProfileBannerView banner={profile.banner} className="h-48 sm:h-64 lg:h-72" />

            <div className="relative px-5 pb-7 sm:px-8 sm:pb-9">
              <div className="flex items-end justify-between gap-4">
                <div className="relative -mt-14 h-28 w-28 shrink-0 sm:-mt-16 sm:h-32 sm:w-32">
                  <Image
                    src={getProfileAvatar(profile)}
                    alt={`${profile.name}的头像`}
                    fill
                    sizes="128px"
                    priority
                    unoptimized
                    className="rounded-full border-[5px] border-surface bg-surface-active object-cover shadow-md"
                  />
                  {isOwner && <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-surface bg-success" title="这是你" />}
                </div>

                {isOwner && !profile.isSystem && (
                  <button
                    type="button"
                    onClick={() => setEditorOpen(true)}
                    className="mb-1 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-md"
                  >
                    <EditOutlined /> 编辑资料
                  </button>
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

              <div className="mt-8 border-t border-border pt-6">
                <div className="flex max-w-sm items-start gap-3 rounded-xl bg-background-secondary px-4 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">✦</div>
                  <div>
                    <div className="text-sm font-medium text-foreground">星球旅程</div>
                    <div className="mt-1 text-xs leading-relaxed text-foreground-muted">{formatJoinedDate(profile.createdAt)}</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}
      </main>

      {profile && isOwner && !profile.isSystem && (
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
      )}
    </div>
  );
}
