'use client';

import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useId, useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
import { deleteMoment } from '../client';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentActions } from './MomentActions';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';

type Props = {
  moment: Moment;
  onDeleted: (id: string) => void;
};

export function MomentCard({ moment, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const canExpand = moment.text.length > 140 || moment.text.split('\n').length > 5;

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
    <article className={`moment-card${moment.media.length > 0 ? ' has-media' : ''}`}>
      <header className="moment-card-head">
        <div className="flex min-w-0 items-center gap-3">
          <MomentAvatar author={moment.author} />
          <div className="min-w-0">
            <Link href={createProfileHref(moment.author.userId, { returnTo: '/moments' })} title={`@${moment.author.userId}`} className="block truncate text-sm font-semibold text-foreground hover:text-primary">
              {moment.author.name}
            </Link>
            <div className="moment-card-byline"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time></div>
          </div>
        </div>
        {moment.canDelete && (
          <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
            <button type="button" className="moment-icon-button" aria-label="管理这条心迹"><MoreOutlined /></button>
          </Dropdown>
        )}
      </header>

      <div className="moment-entry-content">
        {moment.text && (
          <div className="moment-post-copy">
            <p id={textId} className={`moment-card-text${canExpand && !expanded ? ' is-collapsed' : ''}`}>{moment.text}</p>
            {canExpand && <button type="button" className="moment-expand-button" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开全文'}</button>}
          </div>
        )}
        <MomentMediaView media={moment.media} />
        {moment.voice && <div className="moment-card-voice"><MomentVoicePlayer voice={moment.voice} /></div>}

        {moment.location && <div className="moment-card-meta"><span><EnvironmentOutlined /> {moment.location.label}</span></div>}

        <MomentActions key={moment.id} moment={moment} appearance="journal" />
        {error && <p className="moment-inline-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}
