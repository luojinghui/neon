'use client';

import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
import { deleteMoment } from '../client';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentComments } from './MomentComments';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';

type Props = {
  moment: Moment;
  onDeleted: (id: string) => void;
};

export function MomentCard({ moment, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    if (deleting || !window.confirm('删除整条心迹？正文、媒体、语音和全部评论都会被永久删除。')) return;
    setDeleting(true);
    setError('');
    try {
      await deleteMoment(moment);
      onDeleted(moment.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败，请重试');
      setDeleting(false);
    }
  };

  const menu: MenuProps = {
    items: [
      {
        key: 'delete',
        danger: true,
        icon: deleting ? <LoadingOutlined /> : <DeleteOutlined />,
        label: <span>{moment.isOwner ? '删除心迹' : '以超管身份删除'}<small className="ml-2 text-foreground-muted">含全部评论</small></span>,
        disabled: deleting,
        onClick: () => void remove()
      }
    ]
  };

  return (
    <article className="moment-card">
      <header className="moment-card-head">
        <div className="flex min-w-0 items-center gap-3">
          <MomentAvatar author={moment.author} />
          <div className="min-w-0">
            <Link href={createProfileHref(moment.author.userId, { returnTo: '/moments' })} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
              {moment.author.name}
            </Link>
            <div className="mt-0.5 truncate text-xs text-foreground-muted">@{moment.author.userId} · {formatMomentTime(moment.createdAt)}</div>
          </div>
        </div>
        {moment.canDelete && (
          <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
            <button type="button" className="moment-icon-button" aria-label="管理这条心迹"><MoreOutlined /></button>
          </Dropdown>
        )}
      </header>

      {moment.text && <p className="moment-card-text">{moment.text}</p>}
      <MomentMediaView media={moment.media} />
      {moment.voice && <div className="px-4 pb-3 pt-1 sm:px-5"><MomentVoicePlayer voice={moment.voice} /></div>}

      <footer className="moment-card-meta">
        {moment.location ? <span><EnvironmentOutlined /> {moment.location.label}</span> : <span />}
        <time dateTime={moment.createdAt}>{new Date(moment.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
      </footer>

      <MomentComments momentId={moment.id} initialComments={moment.comments} initialCount={moment.commentCount} />
      {error && <p className="moment-inline-error mx-4 mb-4" role="alert">{error}</p>}
    </article>
  );
}
