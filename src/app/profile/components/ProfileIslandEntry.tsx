'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonClassName } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { message } from '@/components/ui/message';
import { buildInviteLink, getProfileIslandStatus } from '@/app/island/core/client';
import type { ProfileIslandStatus } from '@/app/island/core/types';

interface ProfileIslandEntryProps {
  userId: string;
  isOwner: boolean;
}

export function ProfileIslandEntry({ userId, isOwner }: ProfileIslandEntryProps) {
  const [status, setStatus] = useState<ProfileIslandStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus(null);
    if (!userId) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    getProfileIslandStatus(userId)
      .then((result) => {
        if (active) {
          setStatus(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setStatus(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    if (!isOwner) return null;
    return (
      <div className="profile-detail animate-pulse" aria-hidden="true">
        <span className="profile-detail-icon" />
        <div className="profile-detail-body">
          <div className="profile-detail-head">
            <div className="h-4 w-16 rounded-sm bg-surface-active" />
          </div>
          <div className="mt-1 h-4 w-32 rounded-sm bg-surface-active" />
        </div>
      </div>
    );
  }

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
    <div className="profile-detail">
      <span className="profile-detail-icon">
        <Icon name="environment" />
      </span>
      <div className="profile-detail-body">
        <div className="profile-detail-head">
          <dt>{isOwner ? '我的浮岛' : 'TA 的浮岛'}</dt>
          <div className="profile-detail-actions">
            {isOwner && island?.inviteToken && (
              <Tooltip title={copied ? '已复制邀请链接' : '复制邀请链接'}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  type="button"
                  icon={<Icon name={copied ? 'check' : 'link'} size="sm" tone={copied ? 'success' : 'inherit'} />}
                  onClick={() => void handleCopyInvite()}
                  aria-label={copied ? '邀请链接已复制' : '复制邀请链接'}
                />
              </Tooltip>
            )}
            <Tooltip title={island ? '进入浮岛' : '前往浮岛'}>
              <Link
                href={targetHref}
                className={buttonClassName({ variant: 'ghost', size: 'sm', iconOnly: true })}
                aria-label={island ? '进入浮岛' : '前往浮岛'}
              >
                <Icon name="arrow-right" size="sm" />
              </Link>
            </Tooltip>
          </div>
        </div>
        <dd>{island ? island.name : '开启你的专属天空小岛'}</dd>
      </div>
    </div>
  );
}
