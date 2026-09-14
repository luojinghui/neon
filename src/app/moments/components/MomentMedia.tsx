'use client';

import { LeftOutlined, RightOutlined, VideoCameraFilled } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { MomentMedia } from '../types';

type Props = {
  media: MomentMedia[];
  immersive?: boolean;
};

export function MomentMediaView({ media, immersive = false }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [media]);
  if (media.length === 0) return null;
  const current = media[Math.min(index, media.length - 1)];

  const move = (direction: -1 | 1) => setIndex((value) => (value + direction + media.length) % media.length);

  return (
    <div className={`moment-media-view ${immersive ? 'moment-media-view-immersive' : ''}`}>
      {current.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.url} alt={current.name || '心迹图片'} className="moment-media-content" loading="lazy" />
      ) : (
        <video src={current.url} className="moment-media-content" controls playsInline preload="metadata" aria-label={current.name || '心迹视频'} />
      )}

      {media.length > 1 && (
        <>
          <button type="button" onClick={() => move(-1)} className="moment-media-arrow moment-media-arrow-left" aria-label="上一项媒体"><LeftOutlined /></button>
          <button type="button" onClick={() => move(1)} className="moment-media-arrow moment-media-arrow-right" aria-label="下一项媒体"><RightOutlined /></button>
          <div className="moment-media-dots" aria-label={`第 ${index + 1} 项，共 ${media.length} 项`}>
            {media.map((item, dotIndex) => <span key={item.id} className={dotIndex === index ? 'is-active' : ''} />)}
          </div>
          <span className="moment-media-count">{index + 1}/{media.length}</span>
        </>
      )}
      {current.type === 'video' && <span className="moment-media-kind"><VideoCameraFilled /> 视频</span>}
    </div>
  );
}
