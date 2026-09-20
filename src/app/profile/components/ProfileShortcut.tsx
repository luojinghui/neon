'use client';

import { UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { createProfileHref } from '../navigation';
import { getProfileAvatar } from '../types';
import { useCurrentProfile } from '../useCurrentProfile';

export function ProfileShortcut({ returnTo = '/' }: { returnTo?: string }) {
  const profile = useCurrentProfile();

  return (
    <Link
      href={createProfileHref('', { returnTo })}
      className="app-icon-button"
      aria-label={profile ? `打开${profile.name}的个人中心` : '打开个人中心'}
      title={profile ? `${profile.name} · 个人中心` : '个人中心'}
    >
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
