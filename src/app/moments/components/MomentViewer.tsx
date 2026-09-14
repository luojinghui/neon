'use client';

import { DeleteOutlined, EnvironmentOutlined, LeftOutlined, LoadingOutlined, RightOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useEffect, useState } from 'react';
import { deleteMoment } from '../client';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentAvatar } from './MomentAvatar';
import { MomentMediaView } from './MomentMedia';
import { MomentVoicePlayer } from './MomentVoice';

type Props = {
  open: boolean;
  moments: Moment[];
  startIndex: number;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export function MomentViewer({ open, moments, startIndex, onClose, onDeleted }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setIndex(startIndex), [startIndex, open]);

  const move = (direction: -1 | 1) => {
    if (moments.length < 2) return;
    setIndex((current) => (current + direction + moments.length) % moments.length);
    setError('');
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (moments.length === 0) return null;
  const current = moments[Math.min(index, moments.length - 1)];

  const remove = async () => {
    if (deleting || !window.confirm('删除整条心迹？正文、媒体、语音和全部评论都会被永久删除。')) return;
    setDeleting(true);
    setError('');
    try {
      await deleteMoment(current);
      onDeleted(current.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败，请重试');
      setDeleting(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered destroyOnHidden width={920} title={null} className="moment-viewer-modal">
      <div className="moment-viewer">
        <header className="moment-viewer-head">
          <span>{index + 1} / {moments.length}</span>
          <strong>我的心迹</strong>
          {current.canDelete ? <button type="button" onClick={() => void remove()} disabled={deleting}>{deleting ? <LoadingOutlined /> : <DeleteOutlined />}删除</button> : <span />}
        </header>

        <div className="moment-viewer-stage">
          {current.media.length > 0 ? (
            <MomentMediaView media={current.media} immersive />
          ) : (
            <div className={`moment-viewer-placeholder ${current.voice ? 'is-voice' : 'is-text'}`}>
              {current.voice ? <><span className="moment-viewer-wave"><i /><i /><i /><i /><i /><i /><i /></span><span>VOICE MOMENT</span></> : <span>✦</span>}
            </div>
          )}
          {moments.length > 1 && (
            <>
              <button type="button" className="moment-viewer-arrow moment-viewer-arrow-left" onClick={() => move(-1)} aria-label="上一条心迹"><LeftOutlined /></button>
              <button type="button" className="moment-viewer-arrow moment-viewer-arrow-right" onClick={() => move(1)} aria-label="下一条心迹"><RightOutlined /></button>
            </>
          )}
        </div>

        <div className="moment-viewer-caption">
          <div className="flex items-center gap-3">
            <MomentAvatar author={current.author} size={38} />
            <div className="min-w-0"><div className="truncate text-sm font-medium text-foreground">{current.author.name}</div><div className="text-xs text-foreground-muted">{formatMomentTime(current.createdAt)}</div></div>
          </div>
          {current.text && <p>{current.text}</p>}
          {current.voice && <MomentVoicePlayer voice={current.voice} />}
          <div className="moment-viewer-meta">
            <span>{current.media.length > 0 ? `${current.media.length} 项媒体` : current.voice ? '语音心迹' : '文字心迹'}</span>
            {current.location && <span><EnvironmentOutlined />{current.location.label}</span>}
          </div>
          {error && <p className="moment-inline-error" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
