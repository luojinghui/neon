'use client';

import { LeftOutlined, PlayCircleFilled, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import type { MomentMedia } from '../types';
import './moment-media.css';

type Props = {
  media: MomentMedia[];
  immersive?: boolean;
};

export function MomentMediaView({ media, immersive = false }: Props) {
  // Tie the active item to its ID so list refreshes cannot move a selection to another image.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = media.findIndex((item) => item.id === selectedId);
  const index = Math.max(0, selectedIndex);
  const current = media[index];
  if (!current) return null;

  const select = (nextIndex: number) => setSelectedId(media[nextIndex].id);
  const move = (direction: -1 | 1) => select((index + direction + media.length) % media.length);

  return (
    <div className={`moment-media-view ${immersive ? 'moment-media-view-immersive' : ''}`} role="region" aria-label="心迹图片与视频">
      <div className="moment-media-stage">
        {current.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.id} src={current.url} alt={current.name || `心迹图片 ${index + 1}`} className="moment-media-content" loading="lazy" />
        ) : (
          <video key={current.id} src={current.url} className="moment-media-content" controls playsInline preload="metadata" aria-label={current.name || '心迹视频'} />
        )}
        {media.length > 1 && (
          <>
            <button type="button" onClick={() => move(-1)} className="moment-media-arrow moment-media-arrow-left" aria-label="上一项媒体"><LeftOutlined /></button>
            <button type="button" onClick={() => move(1)} className="moment-media-arrow moment-media-arrow-right" aria-label="下一项媒体"><RightOutlined /></button>
          </>
        )}
      </div>
      {media.length > 1 && (
        <div className="moment-media-navigation">
          <div className="moment-media-thumbnails" aria-label="选择要查看的图片或视频">
            {media.map((item, mediaIndex) => (
              <button key={item.id} type="button" className={`moment-media-thumbnail ${mediaIndex === index ? 'is-active' : ''}`} aria-label={`查看第 ${mediaIndex + 1} 项${item.type === 'image' ? '图片' : '视频'}`} aria-pressed={mediaIndex === index} onClick={() => select(mediaIndex)}>
                {item.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" loading="lazy" />
                ) : <PlayCircleFilled />}
              </button>
            ))}
          </div>
          <span className="moment-media-count" aria-live="polite" aria-atomic="true">{index + 1} / {media.length}</span>
        </div>
      )}
    </div>
  );
}
