'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useConfirm } from '@/components/ui/confirm';
import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { deleteMoment } from '../client';
import { formatMomentTime, splitMomentParagraphs, splitTrailingImages } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentBody } from './MomentBody';
import { MomentComposer } from './MomentComposer';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';
import { MomentActions, type MomentReactionPatch } from './MomentActions';
import { MomentAttachments } from './MomentAttachments';
import './moment-gallery.css';

type Props = {
  moment: Moment;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated?: (moment: Moment) => void;
  onReactionChange?: (patch: MomentReactionPatch) => void;
};

export function MomentViewer({ moment, onClose, onDeleted, onUpdated, onReactionChange }: Props) {
  const modal = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<Moment>(moment);

  useEffect(() => {
    setCurrent(moment);
  }, [moment]);

  const canEdit = current.canEdit ?? current.canDelete;
  const { interleavedBlocks, trailingImages } = splitTrailingImages(current.blocks);
  const displayMedia = trailingImages.length > 0 ? [...trailingImages, ...current.media] : current.media;
  const hasBodyContent = interleavedBlocks.length > 0
    || (current.text ? splitMomentParagraphs(current.text).length > 0 : false);

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
          await deleteMoment(current);
          onDeleted(current.id);
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : '删除失败，请重试');
          setDeleting(false);
        }
      }
    });
  };

  return (
    <>
      <Modal open onCancel={onClose} footer={null} centered destroyOnHidden width={800} title="星语详情" className="moment-viewer-modal">
        <article className="moment-viewer">
          <header className="moment-viewer-author">
            <MomentAvatar author={current.author} size={38} />
            <div className="min-w-0">
              <div className="truncate text-body font-medium text-foreground">{current.author.name}</div>
              <time className="text-caption text-foreground-muted" dateTime={current.createdAt}>
                {formatMomentTime(current.createdAt)}{current.isEdited ? ' · 已编辑' : ''}
              </time>
            </div>
          </header>
          {hasBodyContent && (
            <div className="moment-viewer-text">
              <MomentBody text={current.text} blocks={interleavedBlocks} immersive />
            </div>
          )}
          {displayMedia.length > 0 && <MomentMediaView media={displayMedia} immersive />}
          <MomentAttachments attachments={current.attachments} />
          {current.voice && <div className="moment-viewer-voice"><MomentVoicePlayer voice={current.voice} /></div>}
          {(current.location || canEdit || current.canDelete) && <footer className="moment-viewer-footer">
            <span className="moment-viewer-location">{current.location && <><EnvironmentOutlined />{current.location.label}</>}</span>
            <div className="flex items-center gap-1">
              {canEdit && <Button variant="ghost" type="button" onClick={() => setEditing(true)} disabled={deleting}><Icon name="edit" size="sm" />编辑</Button>}
              {current.canDelete && <Button variant="ghost" type="button" className="moment-viewer-delete" onClick={() => void remove()} disabled={deleting}>{deleting ? <LoadingOutlined /> : <DeleteOutlined />}删除</Button>}
            </div>
          </footer>}
          <MomentActions moment={current} onChange={onReactionChange} />
          {error && <p className="moment-inline-error" role="alert">{error}</p>}
        </article>
      </Modal>
      {canEdit && (
        <MomentComposer
          appearance="journal"
          open={editing}
          moment={current}
          onClose={() => setEditing(false)}
          onPublished={(updated) => {
            setCurrent(updated);
            onUpdated?.(updated);
          }}
        />
      )}
    </>
  );
}
