'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
import { LinkifiedText } from '@/components/LinkifiedText';
import { deleteMoment } from '../client';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentActions } from './MomentActions';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';
import { MomentAttachments } from './MomentAttachments';

type Props = {
  moment: Moment;
  onDeleted: (id: string) => void;
};

export function MomentCard({ moment, onDeleted }: Props) {
  const modal = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const textId = useId();

  useLayoutEffect(() => {
    setExpanded(false);
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight);
      const previewLines = parseInt(style.getPropertyValue('--moment-preview-lines'), 10) || 4;
      setCanExpand(element.scrollHeight > lineHeight * previewLines + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [moment.text]);

  const remove = () => {
    if (deleting) return;
    modal.confirm({
      title: '删除整条星语？',
      content: '正文、媒体、语音和全部评论都会被永久删除。',
      okText: '删除星语',
      cancelText: '取消',
      async onOk() {
        setDeleting(true);
        setError('');
        try {
          await deleteMoment(moment);
          onDeleted(moment.id);
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : '删除失败，请重试');
          setDeleting(false);
        }
      }
    });
  };

  const menu: MenuProps = {
    items: [
      {
        key: 'delete',
        danger: true,
        icon: deleting ? <LoadingOutlined /> : <DeleteOutlined />,
        label: '删除',
        disabled: deleting,
        onClick: () => void remove()
      }
    ]
  };

  return (
    <Card padding="none" bodyWrap={false} id={`moment-${moment.id}`} className={`moment-card${moment.media.length > 0 ? ' has-media' : ''}`}>
      <header className="moment-card-head">
        <div className="flex min-w-0 items-center gap-2">
          <MomentAvatar author={moment.author} size={32} />
          <div className="min-w-0">
            <Link href={createProfileHref(moment.author.userId, { returnTo: '/moments' })} title={`@${moment.author.userId}`} className="moment-card-author block truncate font-semibold text-foreground hover:text-primary">
              {moment.author.name}
            </Link>
            <div className="moment-card-byline"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time></div>
          </div>
        </div>
        {moment.canDelete && (
          <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
            <Button variant="ghost" iconOnly type="button" aria-label="管理这条星语"><MoreOutlined /></Button>
          </Dropdown>
        )}
      </header>

      <div className="moment-entry-content">
        {moment.text && (
          <div className="moment-post-copy">
            <p ref={textRef} id={textId} className={`moment-card-text${!expanded ? ' is-collapsed' : ''}`}><LinkifiedText content={moment.text} /></p>
            {canExpand && <Button variant="ghost" size="sm" type="button" className="moment-expand-button" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开全文'}</Button>}
          </div>
        )}
        <MomentMediaView media={moment.media} />
        <MomentAttachments attachments={moment.attachments} />
        {moment.voice && <div className="moment-card-voice"><MomentVoicePlayer voice={moment.voice} /></div>}

        {moment.location && <div className="moment-card-meta"><span><EnvironmentOutlined /> {moment.location.label}</span></div>}

        <MomentActions key={moment.id} moment={moment} appearance="journal" />
        {error && <p className="moment-inline-error" role="alert">{error}</p>}
      </div>
    </Card>
  );
}
