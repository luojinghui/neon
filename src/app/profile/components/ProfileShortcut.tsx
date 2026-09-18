'use client';

import { UserOutlined } from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ensureCurrentProfile, PROFILE_CHANGED_EVENT } from '../client';
import { createProfileHref } from '../navigation';
import { getProfileAvatar, type PublicProfile } from '../types';

export function ProfileShortcut({ returnTo = '/' }: { returnTo?: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let active = true;
    void ensureCurrentProfile()
      .then((current) => {
        if (active) setProfile(current);
      })
      .catch(() => undefined);

    const handleProfileChanged = (event: Event) => {
      const changed = (event as CustomEvent<PublicProfile>).detail;
      if (changed) setProfile(changed);
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    return () => {
      active = false;
      window.removeEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    };
  }, []);

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
