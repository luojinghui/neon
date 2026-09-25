'use client';

import { AudioOutlined, HeartOutlined, MessageOutlined, LoadingOutlined, PictureOutlined, PlayCircleFilled, ReloadOutlined, EditOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { formatMomentTime } from '../format';
import type { Moment } from '../types';
import { MomentViewer } from './MomentViewer';
import { VideoCover } from '@/components/video-player/VideoPlayer';
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
  const [filter, setFilter] = useState<'all' | 'visual' | 'notes'>('all');
  const selectedMoment = moments.find((moment) => moment.id === selectedId);
  const visible = moments.filter(moment => filter === 'all' || (filter === 'visual' ? moment.media.length > 0 : moment.media.length === 0));

  return (
    <section className="moment-profile-gallery" aria-label="心迹列表" aria-busy={loading}>
      <header className="moment-profile-heading"><div><h2>时光切片</h2><p>{moments.length} 条记录 · {moments.reduce((sum, moment) => sum + (moment.likeCount || 0), 0)} 次喜欢</p></div><div className="moment-profile-filters" role="group" aria-label="筛选心迹">{([['all', '全部'], ['visual', '影像'], ['notes', '随记']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></header>
      {loading && <div className="moment-profile-status" role="status"><LoadingOutlined /><span>正在读取心迹…</span></div>}
      {error && (
        <div className="moment-profile-status is-error" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry} disabled={loading}><ReloadOutlined />重试</button>}
        </div>
      )}
      {!loading && !error && moments.length === 0 && <div className="moment-profile-empty">还没有留下心迹。</div>}
      <div className="moment-profile-grid">
        {visible.map((moment) => {
          const firstMedia = moment.media[0];
          return (
            <button key={moment.id} type="button" className={`moment-profile-entry ${firstMedia ? 'has-media' : ''}`} onClick={() => setSelectedId(moment.id)} aria-label={`查看心迹：${moment.text || (moment.voice ? '语音心迹' : '图片与视频')}`}>
              {!firstMedia && <span className="moment-profile-note-label">{moment.voice ? <AudioOutlined /> : <EditOutlined />}{moment.voice ? '声音日记' : '随手记'}</span>}
              {firstMedia && (
                <span className="moment-profile-cover">
                  {firstMedia.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstMedia.url} alt="" loading="lazy" />
                  ) : <VideoCover src={firstMedia.url} />}
                  <span className="moment-profile-media-badge">
                    {firstMedia.type === 'video' ? <PlayCircleFilled /> : <PictureOutlined />}
                    {moment.media.length > 1 ? `${moment.media.length} 项媒体` : firstMedia.type === 'video' ? '视频' : '图片'}
                  </span>
                </span>
              )}
              <span className="moment-profile-entry-body">
                {moment.text && <span className="moment-profile-entry-text">{moment.text}</span>}
                {moment.voice && <span className="moment-profile-voice"><AudioOutlined />语音 · {Math.max(1, Math.round(moment.voice.durationMs / 1000))} 秒</span>}
                <span className="moment-profile-entry-footer"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time><span className="moment-profile-reactions"><span><HeartOutlined /> {moment.likeCount || 0}</span><span><MessageOutlined /> {moment.commentCount || 0}</span></span></span>
              </span>
            </button>
          );
        })}
      </div>
      {!loading && moments.length > 0 && visible.length === 0 && <p className="moment-profile-empty">这个分类还没有记录。</p>}
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
