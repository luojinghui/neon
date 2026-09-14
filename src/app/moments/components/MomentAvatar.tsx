'use client';

import Image from 'next/image';
import Link from 'next/link';
import { createProfileHref } from '@/app/profile/navigation';
import { getProfileAvatar } from '@/app/profile/types';
import type { MomentAuthor } from '../types';

type Props = {
  author: MomentAuthor;
  size?: number;
  link?: boolean;
  returnTo?: string;
  className?: string;
};

export function MomentAvatar({ author, size = 42, link = true, returnTo = '/moments', className = '' }: Props) {
  const image = (
    <Image
      src={getProfileAvatar(author)}
      alt={link ? `${author.name}的头像` : ''}
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 rounded-full bg-surface-active object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
  if (!link || author.userId === 'unknown') return image;
  return (
    <Link href={createProfileHref(author.userId, { returnTo })} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label={`查看${author.name}的个人主页`}>
      {image}
    </Link>
  );
}
