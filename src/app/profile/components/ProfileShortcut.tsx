'use client';

import { UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { createProfileHref } from '../navigation';
import { getProfileAvatar } from '../types';
import { useCurrentProfile } from '../useCurrentProfile';
import { useSocialStore } from '@/app/social/client';

export function ProfileShortcut({ returnTo = '/' }: { returnTo?: string }) {
  const profile = useCurrentProfile();
  const unread = useSocialStore((state) => state.conversations.reduce((total, item) => total + item.unreadCount, 0));

  return (
    <Link
      href={`${createProfileHref('', { returnTo })}${unread > 0 ? '&section=messages' : ''}`}
      className="app-icon-button relative"
      aria-label={profile ? `打开${profile.name}的个人中心` : '打开个人中心'}
      title={profile ? `${profile.name} · 个人中心` : '个人中心'}
    >
      {unread > 0 && <span aria-label={`${unread} 条未读私信`} className="absolute right-0.5 top-0.5 z-10 h-2.5 w-2.5 rounded-full border-2 border-surface bg-red-500" />}
      {profile ? (
        <Image
          src={getProfileAvatar(profile)}
          alt=""
          width={24}
          height={24}
          unoptimized
          className="h-6 w-6 shrink-0 rounded-full bg-surface-active object-cover"
        />
      ) : (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs text-primary">
          <UserOutlined />
        </span>
      )}
    </Link>
  );
}
