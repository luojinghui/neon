'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import type { MomentMedia } from '../types';
import { ImageViewer } from '@/components/image-viewer/ImageViewer';
import { VideoPlayer } from '@/components/video-player/VideoPlayer';
import './moment-media.css';

type Props = {
  media: MomentMedia[];
  immersive?: boolean;
};

export function MomentMediaView({ media, immersive = false }: Props) {
  const images = media.filter((item) => item.type === 'image');
  const videos = media.filter((item) => item.type === 'video');
  // Keep an open preview on the same image when a refreshed list changes order.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [singleImage, setSingleImage] = useState<{ id: string; ratio: number } | null>(null);
  const selectedIndex = images.findIndex((item) => item.id === selectedId);
  const singleRatio = singleImage?.id === images[0]?.id ? singleImage?.ratio : 4 / 3;

  const closePreview = useCallback(() => {
    setSelectedId(null);
  }, []);

  if (!media.length) return null;

  return (
    <div className={`moment-media-view${immersive ? ' moment-media-view-immersive' : ''}`} role="region" aria-label="心迹图片与视频">
      {images.length > 0 && (
        <div
          className="moment-media-grid"
          data-count={images.length}
          style={{ '--moment-single-ratio': singleRatio } as CSSProperties}
          role="group"
          aria-label={`共 ${images.length} 张图片，点击可查看大图`}
        >
          {images.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="moment-media-tile"
              aria-label={`查看第 ${index + 1} 张图片，共 ${images.length} 张${item.name ? `：${item.name}` : ''}`}
              aria-haspopup="dialog"
              onClick={() => setSelectedId(item.id)}
            >
              {/* Keep the feed compact; the viewer displays the uncropped original. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.name || `心迹图片 ${index + 1}`}
                className="moment-media-image"
                loading="lazy"
                decoding="async"
                onLoad={(event) => {
                  if (images.length !== 1) return;
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth && naturalHeight) {
                    setSingleImage({ id: item.id, ratio: Math.min(16 / 9, Math.max(3 / 4, naturalWidth / naturalHeight)) });
                  }
                }}
              />
            </button>
          ))}
        </div>
      )}
      {selectedIndex >= 0 && (
        <ImageViewer images={images} currentIndex={selectedIndex} onSelect={setSelectedId} onClose={closePreview} title="心迹影像" />
      )}
      {videos.length > 0 && (
        <div className="moment-media-video-list">
          {videos.map((item, index) => (
            <VideoPlayer
              key={item.id}
              src={item.url}
              className="moment-media-video"
              label={`心迹视频 ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
