'use client';

import { AudioOutlined, LoadingOutlined, PictureOutlined, PlayCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentViewer } from './MomentViewer';
import './moment-gallery.css';

type Props = {
  moments: Moment[];
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  onDeleted: (id: string) => void;
};

export function MomentGallery({ moments, loading, error = '', onRetry, onDeleted }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMoment = moments.find((moment) => moment.id === selectedId);

  return (
    <section className="moment-profile-gallery" aria-label="心迹列表" aria-busy={loading}>
      {loading && <div className="moment-profile-status" role="status"><LoadingOutlined /><span>正在读取心迹…</span></div>}
      {error && (
        <div className="moment-profile-status is-error" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry} disabled={loading}><ReloadOutlined />重试</button>}
        </div>
      )}
      {!loading && !error && moments.length === 0 && <div className="moment-profile-empty">还没有留下心迹。</div>}
      <div className="moment-profile-grid">
        {moments.map((moment) => {
          const firstMedia = moment.media[0];
          return (
            <button key={moment.id} type="button" className={`moment-profile-entry ${firstMedia ? 'has-media' : ''}`} onClick={() => setSelectedId(moment.id)} aria-label={`查看心迹：${moment.text || (moment.voice ? '语音心迹' : '图片与视频')}`}>
              {firstMedia && (
                <span className="moment-profile-cover">
                  {firstMedia.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstMedia.url} alt="" loading="lazy" />
                  ) : <video src={firstMedia.url} muted playsInline preload="metadata" aria-hidden="true" />}
                  <span className="moment-profile-media-badge">
                    {firstMedia.type === 'video' ? <PlayCircleFilled /> : <PictureOutlined />}
                    {moment.media.length > 1 ? `${moment.media.length} 项媒体` : firstMedia.type === 'video' ? '视频' : '图片'}
                  </span>
                </span>
              )}
              <span className="moment-profile-entry-body">
                {moment.text && <span className="moment-profile-entry-text">{moment.text}</span>}
                {moment.voice && <span className="moment-profile-voice"><AudioOutlined />语音 · {Math.max(1, Math.round(moment.voice.durationMs / 1000))} 秒</span>}
                <span className="moment-profile-entry-footer"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time><span>查看详情</span></span>
              </span>
            </button>
          );
        })}
      </div>
      {selectedMoment && (
        <MomentViewer
          key={selectedMoment.id}
          moment={selectedMoment}
          onClose={() => setSelectedId(null)}
          onDeleted={(id) => { setSelectedId(null); onDeleted(id); }}
        />
      )}
    </section>
  );
}
