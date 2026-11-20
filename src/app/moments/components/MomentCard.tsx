'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Icon } from '@/components/ui/icon';
import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';
import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
import { LinkifiedText } from '@/components/LinkifiedText';
import { deleteMoment } from '../client';
import { formatMomentTime, splitMomentParagraphs } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentActions, type MomentReactionPatch } from './MomentActions';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';
import { MomentAttachments } from './MomentAttachments';
import { MomentViewer } from './MomentViewer';

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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [liveState, setLiveState] = useState({
    liked: moment.liked ?? false,
    likeCount: moment.likeCount ?? 0,
    commentCount: moment.commentCount
  });
  const textRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const paragraphs = moment.text ? splitMomentParagraphs(moment.text) : [];
  const currentMoment: Moment = { ...moment, ...liveState };

  useEffect(() => {
    setLiveState({
      liked: moment.liked ?? false,
      likeCount: moment.likeCount ?? 0,
      commentCount: moment.commentCount
    });
  }, [moment.liked, moment.likeCount, moment.commentCount]);

  const applyReactionPatch = (patch: MomentReactionPatch) => {
    setLiveState((current) => ({ ...current, ...patch }));
  };

  useLayoutEffect(() => {
    setExpanded(false);
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight);
      const previewLines = parseInt(style.getPropertyValue('--moment-preview-lines'), 10) || 10;
      setCanExpand(element.scrollHeight > lineHeight * previewLines + 2);
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

  const menuItems: DropdownItem[] = [
    {
      key: 'delete',
      danger: true,
      icon: deleting ? <LoadingOutlined /> : <DeleteOutlined />,
      label: '删除',
      disabled: deleting,
      onClick: () => void remove()
    }
  ];

  return (
    <Card padding="none" bodyWrap={false} id={`moment-${moment.id}`} className={`moment-card${moment.media.length > 0 ? ' has-media' : ''}`}>
      <header className="moment-card-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <MomentAvatar author={moment.author} size={36} />
          <div className="min-w-0">
            <Link href={createProfileHref(moment.author.userId, { returnTo: '/moments' })} title={`@${moment.author.userId}`} className="moment-card-author block truncate font-semibold text-foreground hover:text-primary">
              {moment.author.name}
            </Link>
            <div className="moment-card-byline"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time></div>
          </div>
        </div>
        {moment.canDelete && (
          <Dropdown items={menuItems} trigger={['click']} placement="bottomRight">
            <Button variant="ghost" iconOnly type="button" aria-label="管理这条星语"><MoreOutlined /></Button>
          </Dropdown>
        )}
      </header>

      <div className="moment-entry-content">
        {paragraphs.length > 0 && (
          <div className="moment-post-copy">
            <div ref={textRef} id={textId} className={`moment-card-text${!expanded ? ' is-collapsed' : ''}${canExpand && !expanded ? ' has-overflow' : ''}`}>
              {paragraphs.map((paragraph, index) => <p key={index}><LinkifiedText content={paragraph} /></p>)}
            </div>
            {canExpand && (
              <div className="moment-post-actions">
                <Button variant="ghost" size="sm" type="button" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>
                  {expanded ? '收起' : '展开全文'}
                </Button>
                <Button variant="ghost" size="sm" type="button" icon={<Icon name="expand" size="sm" />} aria-haspopup="dialog" aria-expanded={viewerOpen} onClick={() => setViewerOpen(true)}>
                  详情阅读
                </Button>
              </div>
            )}
          </div>
        )}
        <MomentMediaView media={moment.media} />
        <MomentAttachments attachments={moment.attachments} />
        {moment.voice && <div className="moment-card-voice"><MomentVoicePlayer voice={moment.voice} /></div>}

        {moment.location && <div className="moment-card-meta"><span><EnvironmentOutlined /> {moment.location.label}</span></div>}

        <MomentActions key={moment.id} moment={currentMoment} appearance="journal" onChange={applyReactionPatch} />
        {error && <p className="moment-inline-error" role="alert">{error}</p>}
      </div>
      {viewerOpen && (
        <MomentViewer
          moment={currentMoment}
          onClose={() => setViewerOpen(false)}
          onDeleted={(id) => { setViewerOpen(false); onDeleted(id); }}
          onReactionChange={applyReactionPatch}
        />
      )}
    </Card>
  );
}
