'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
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
  const selectedMoment = moments.find((moment) => moment.id === selectedId);

  return (
    <section className="moment-profile-gallery" aria-label="星语列表" aria-busy={loading}>
      <header className="moment-profile-heading"><div><h2>时光切片</h2><p>{moments.length} 条记录 · {moments.reduce((sum, moment) => sum + (moment.likeCount || 0), 0)} 次喜欢</p></div></header>
      {loading && <div className="moment-profile-status" role="status"><Icon name="loading" /><span>正在读取星语…</span></div>}
      {error && (
        <div className="moment-profile-status is-error" role="alert">
          <span>{error}</span>
          {onRetry && <Button variant="ghost" type="button" onClick={onRetry} disabled={loading}><Icon name="refresh" />重试</Button>}
        </div>
      )}
      {!loading && !error && moments.length === 0 && <div className="moment-profile-empty">还没有留下星语。</div>}
      <div className="moment-profile-grid">
        {moments.map((moment) => {
          const firstMedia = moment.media[0];
          return (
            <Button variant="outline" key={moment.id} type="button" className={`moment-profile-entry ${firstMedia ? 'has-media' : ''}`} onClick={() => setSelectedId(moment.id)} aria-label={`查看星河：${moment.text || (moment.voice ? '语音星河' : moment.attachments?.[0]?.name || '图片与视频')}`}>
              {!firstMedia && <span className="moment-profile-note-label"><Icon name={moment.voice ? 'audio' : 'edit'} />{moment.voice ? '声音日记' : '随手记'}</span>}
              {firstMedia && (
                <span className="moment-profile-cover">
                  {firstMedia.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstMedia.url} alt="" loading="lazy" />
                  ) : <VideoCover src={firstMedia.url} />}
                  <span className="moment-profile-media-badge">
                    <Icon name={firstMedia.type === 'video' ? 'play-circle-filled' : 'picture'} />
                    {moment.media.length > 1 ? `${moment.media.length} 项媒体` : firstMedia.type === 'video' ? '视频' : '图片'}
                  </span>
                </span>
              )}
              <span className="moment-profile-entry-body">
                {moment.text && <span className="moment-profile-entry-text">{moment.text}</span>}
                {moment.voice && <span className="moment-profile-voice"><Icon name="audio" />语音 · {Math.max(1, Math.round(moment.voice.durationMs / 1000))} 秒</span>}
                {moment.attachments?.length > 0 && <span className="moment-profile-entry-text">{moment.attachments.length} 个附件 · {moment.attachments[0].name}</span>}
                <span className="moment-profile-entry-footer"><time dateTime={moment.createdAt}>{formatMomentTime(moment.createdAt)}</time><span className="moment-profile-reactions"><span><Icon name="heart" active={moment.liked} /> {moment.likeCount > 0 ? moment.likeCount : null}</span><span><Icon name="comment" /> {moment.commentCount > 0 ? moment.commentCount : null}</span></span></span>
              </span>
            </Button>
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
