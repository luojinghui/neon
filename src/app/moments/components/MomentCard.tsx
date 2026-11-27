'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Icon } from '@/components/ui/icon';
import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createProfileHref } from '@/app/profile/navigation';
import { deleteMoment } from '../client';
import { formatMomentTime, splitMomentParagraphs, splitTrailingImages } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentActions, type MomentReactionPatch } from './MomentActions';
import { MomentBody } from './MomentBody';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';
import { MomentAttachments } from './MomentAttachments';
import { MomentComposer } from './MomentComposer';

type Props = {
  moment: Moment;
  onDeleted: (id: string) => void;
  onUpdated?: (moment: Moment) => void;
};

export function MomentCard({ moment, onDeleted, onUpdated }: Props) {
  const modal = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localMoment, setLocalMoment] = useState<Moment>(moment);
  const [liveState, setLiveState] = useState({
    liked: moment.liked ?? false,
    likeCount: moment.likeCount ?? 0,
    commentCount: moment.commentCount
  });
  const textRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const activeMoment = localMoment.id === moment.id && Date.parse(localMoment.updatedAt) >= Date.parse(moment.updatedAt) ? localMoment : moment;
  const { interleavedBlocks, trailingImages, hasInterleavedImages } = splitTrailingImages(activeMoment.blocks);
  const displayMedia = trailingImages.length > 0 ? [...trailingImages, ...activeMoment.media] : activeMoment.media;
  const hasBodyContent = interleavedBlocks.length > 0 || (activeMoment.text ? splitMomentParagraphs(activeMoment.text).length > 0 : false);
  const currentMoment: Moment = { ...activeMoment, ...liveState };
  const canEdit = activeMoment.canEdit ?? activeMoment.canDelete;

  useEffect(() => {
    setLocalMoment(moment);
    setLiveState({
      liked: moment.liked ?? false,
      likeCount: moment.likeCount ?? 0,
      commentCount: moment.commentCount
    });
  }, [moment]);

  const applyReactionPatch = (patch: MomentReactionPatch) => {
    setLiveState((current) => ({ ...current, ...patch }));
  };

  const handleUpdated = (updated: Moment) => {
    setLocalMoment(updated);
    setLiveState({
      liked: updated.liked ?? false,
      likeCount: updated.likeCount ?? 0,
      commentCount: updated.commentCount
    });
    onUpdated?.(updated);
  };

  useLayoutEffect(() => {
    setExpanded(false);
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight);
      const previewLines = parseInt(style.getPropertyValue('--moment-preview-lines'), 10) || 10;
      const previewCap = hasInterleavedImages ? Math.max(lineHeight * previewLines, 448) : lineHeight * previewLines;
      setCanExpand(element.scrollHeight > previewCap + 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeMoment.text, activeMoment.blocks, hasInterleavedImages]);

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
    ...(canEdit
      ? [{
          key: 'edit',
          icon: <Icon name="edit" size="sm" />,
          label: '编辑',
          disabled: deleting,
          onClick: () => setEditing(true)
        }]
      : []),
    ...(activeMoment.canDelete
      ? [{
          key: 'delete',
          danger: true,
          icon: deleting ? <LoadingOutlined /> : <DeleteOutlined />,
          label: '删除',
          disabled: deleting,
          onClick: () => void remove()
        }]
      : [])
  ];

  return (
    <Card padding="none" bodyWrap={false} id={`moment-${activeMoment.id}`} className={`moment-card${displayMedia.length > 0 ? ' has-media' : ''}`}>
      <header className="moment-card-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <MomentAvatar author={activeMoment.author} size={36} />
          <div className="min-w-0">
            <Link href={createProfileHref(activeMoment.author.userId, { returnTo: '/moments' })} title={`@${activeMoment.author.userId}`} className="moment-card-author block truncate font-semibold text-foreground hover:text-primary">
              {activeMoment.author.name}
            </Link>
              <div className="moment-card-byline">
              <time dateTime={activeMoment.createdAt}>{formatMomentTime(activeMoment.createdAt)}</time>
              {activeMoment.isEdited ? ' · 已编辑' : null}
              {' · '}
              <Link href={`/moments/${activeMoment.id}`}>详情</Link>
            </div>
          </div>
        </div>
        {menuItems.length > 0 && (
          <Dropdown items={menuItems} trigger={['click']} placement="bottomRight">
            <Button variant="ghost" iconOnly type="button" aria-label="管理这条星语"><MoreOutlined /></Button>
          </Dropdown>
        )}
      </header>

      <div className="moment-entry-content" onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button, input, textarea, [role="menuitem"]')) return;
        if (window.getSelection()?.toString()) return;
        router.push(`/moments/${activeMoment.id}`);
      }}>
        {hasBodyContent && (
          <div className="moment-post-copy">
            <div ref={textRef} id={textId} className={`moment-card-text${!expanded ? ' is-collapsed' : ''}${hasInterleavedImages ? ' has-inline-images' : ''}${canExpand && !expanded ? ' has-overflow' : ''}`}>
              <MomentBody text={activeMoment.text} blocks={interleavedBlocks} />
            </div>
            {canExpand && (
              <div className="moment-post-actions">
                <Button variant="ghost" size="sm" type="button" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>
                  {expanded ? '收起' : '展开全文'}
                </Button>
                <Link href={`/moments/${activeMoment.id}`} className="text-caption text-primary">进入详情</Link>
              </div>
            )}
          </div>
        )}
        <MomentMediaView media={displayMedia} />
        <MomentAttachments attachments={activeMoment.attachments} />
        {activeMoment.voice && <div className="moment-card-voice"><MomentVoicePlayer voice={activeMoment.voice} /></div>}

        {activeMoment.location && <div className="moment-card-meta"><span><EnvironmentOutlined /> {activeMoment.location.label}</span></div>}

        <MomentActions key={activeMoment.id} moment={currentMoment} appearance="journal" onChange={applyReactionPatch} />
        {error && <p className="moment-inline-error" role="alert">{error}</p>}
      </div>
      {canEdit && (
        <MomentComposer
          appearance="journal"
          open={editing}
          moment={currentMoment}
          onClose={() => setEditing(false)}
          onPublished={handleUpdated}
        />
      )}
    </Card>
  );
}
