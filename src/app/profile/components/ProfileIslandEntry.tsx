'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonClassName } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { message } from '@/components/ui/message';
import { buildInviteLink, getProfileIslandStatus } from '@/app/island/core/client';
import type { ProfileIslandStatus } from '@/app/island/core/types';

interface ProfileIslandEntryProps {
  userId: string;
  isOwner: boolean;
}

export function ProfileIslandEntry({ userId, isOwner }: ProfileIslandEntryProps) {
  const [status, setStatus] = useState<ProfileIslandStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus(null);
    if (!userId) return () => { active = false; };
    getProfileIslandStatus(userId)
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!status) return null;
  if (!isOwner && (!status.accessible || !status.island)) return null;

  const island = status.island;
  const targetHref = island ? `/island/${encodeURIComponent(island.id)}` : '/island';

  const handleCopyInvite = async () => {
    if (!island?.inviteToken) return;
    try {
      await navigator.clipboard.writeText(buildInviteLink(island.inviteToken));
      setCopied(true);
      message.success('已复制邀请链接');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div className="profile-detail min-w-0">
      <span className="profile-detail-icon">
        <Icon name="compass" />
      </span>
      <div className="min-w-0 flex-1">
        <dt>{isOwner ? '我的浮岛' : 'TA 的浮岛'}</dt>
        <dd>
          {island && <div className="mb-2 font-medium text-foreground">{island.name}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={targetHref}
              className={buttonClassName({ variant: isOwner ? 'primary' : 'outline', size: 'sm' })}
            >
              进入浮岛
            </Link>
            {isOwner && island?.inviteToken && (
              <Button
                variant="outline"
                size="sm"
                icon={<Icon name={copied ? 'check' : 'link'} size="sm" />}
                onClick={() => void handleCopyInvite()}
              >
                {copied ? '已复制' : '邀请链接'}
              </Button>
            )}
          </div>
        </dd>
      </div>
    </div>
  );
}
