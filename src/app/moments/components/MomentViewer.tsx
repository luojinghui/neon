'use client';

import { DeleteOutlined, EnvironmentOutlined, LoadingOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useState } from 'react';
import { deleteMoment } from '../client';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';
import { MomentActions } from './MomentActions';
import './moment-gallery.css';

type Props = {
  moment: Moment;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export function MomentViewer({ moment, onClose, onDeleted }: Props) {
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

  return (
    <Modal open onCancel={onClose} footer={null} centered destroyOnHidden width={800} title="心迹详情" className="moment-viewer-modal">
      <article className="moment-viewer">
        <header className="moment-viewer-author">
          <MomentAvatar author={moment.author} size={38} />
          <div className="min-w-0"><div className="truncate text-sm font-medium text-foreground">{moment.author.name}</div><time className="text-xs text-foreground-muted" dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time></div>
        </header>
        {moment.text && <p className="moment-viewer-text">{moment.text}</p>}
        {moment.media.length > 0 && <MomentMediaView media={moment.media} immersive />}
        {moment.voice && <div className="moment-viewer-voice"><MomentVoicePlayer voice={moment.voice} /></div>}
        {(moment.location || moment.canDelete) && <footer className="moment-viewer-footer">
          <span className="moment-viewer-location">{moment.location && <><EnvironmentOutlined />{moment.location.label}</>}</span>
          {moment.canDelete && <button type="button" className="moment-viewer-delete" onClick={() => void remove()} disabled={deleting}>{deleting ? <LoadingOutlined /> : <DeleteOutlined />}删除</button>}
        </footer>}
        <MomentActions moment={moment} />
        {error && <p className="moment-inline-error" role="alert">{error}</p>}
      </article>
    </Modal>
  );
}
