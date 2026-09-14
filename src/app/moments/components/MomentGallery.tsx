'use client';

import { AudioOutlined, LoadingOutlined, PictureOutlined, PlayCircleFilled } from '@ant-design/icons';
import { useState } from 'react';
import type { Moment } from '../types';
import { MomentViewer } from './MomentViewer';

type Props = {
  moments: Moment[];
  loading: boolean;
  error?: string;
  onDeleted: (id: string) => void;
};

export function MomentGallery({ moments, loading, error = '', onDeleted }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (loading) {
    return <div className="moment-profile-loading"><LoadingOutlined /><span>正在读取心迹…</span></div>;
  }
  if (error) return <div className="moment-profile-empty text-danger">{error}</div>;
  if (moments.length === 0) return <div className="moment-profile-empty">还没有留下心迹。</div>;

  return (
    <>
      <div className="moment-profile-grid">
        {moments.map((moment, index) => {
          const firstMedia = moment.media[0];
          return (
            <button key={moment.id} type="button" className={`moment-profile-tile ${!firstMedia ? (moment.voice ? 'is-voice' : 'is-text') : ''}`} onClick={() => setViewerIndex(index)} aria-label={`查看 ${moment.author.name} 发布的心迹`}>
              {firstMedia?.type === 'image' && <img src={firstMedia.url} alt="" loading="lazy" />} {/* eslint-disable-line @next/next/no-img-element */}
              {firstMedia?.type === 'video' && <video src={firstMedia.url} muted playsInline preload="metadata" />}
              {!firstMedia && moment.voice && <><AudioOutlined className="moment-profile-tile-main-icon" /><span className="moment-profile-wave"><i /><i /><i /><i /><i /></span><small>语音 · {Math.max(1, Math.round(moment.voice.durationMs / 1000))} 秒</small></>}
              {!firstMedia && !moment.voice && <span className="moment-profile-text-preview">{moment.text}</span>}
              {firstMedia?.type === 'video' && <PlayCircleFilled className="moment-profile-type-icon" />}
              {moment.media.length > 1 && <span className="moment-profile-type-icon"><PictureOutlined /> {moment.media.length}</span>}
            </button>
          );
        })}
      </div>
      <MomentViewer
        open={viewerIndex !== null}
        moments={moments}
        startIndex={viewerIndex || 0}
        onClose={() => setViewerIndex(null)}
        onDeleted={(id) => { setViewerIndex(null); onDeleted(id); }}
      />
    </>
  );
}
