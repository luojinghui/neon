'use client';

import { Image } from 'antd';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MomentMedia } from '../types';
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
  const [previewRequested, setPreviewRequested] = useState(false);
  const [singleImage, setSingleImage] = useState<{ id: string; ratio: number } | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const selectedIndex = images.findIndex((item) => item.id === selectedId);
  const previewOpen = previewRequested && selectedIndex >= 0;
  const singleRatio = singleImage?.id === images[0]?.id ? singleImage?.ratio : 4 / 3;

  const closePreview = useCallback(() => {
    setPreviewRequested(false);
    previewTrigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    // AntD 6.3.3 handles arrow keys; Escape also needs to stay inside this preview
    // when it is opened from the profile's moment detail modal.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePreview();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [closePreview, previewOpen]);

  if (!media.length) return null;

  return (
    <div className={`moment-media-view${immersive ? ' moment-media-view-immersive' : ''}`} role="region" aria-label="心迹图片与视频">
      {images.length > 0 && (
        <Image.PreviewGroup
          items={images.map((item, index) => ({ src: item.url, alt: `心迹图片 ${index + 1}${item.name ? `：${item.name}` : ''}` }))}
          preview={{
            open: previewOpen,
            current: Math.max(0, selectedIndex),
            onOpenChange: (open) => { if (!open) closePreview(); },
            onChange: (current) => setSelectedId(images[current]?.id ?? null),
            countRender: (current, total) => <span aria-live="polite">{current} / {total}</span>
          }}
        >
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
                onClick={(event) => {
                  previewTrigger.current = event.currentTarget;
                  setSelectedId(item.id);
                  setPreviewRequested(true);
                }}
              >
                {/* The original image opens in PreviewGroup; the feed uses a compact crop. */}
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
        </Image.PreviewGroup>
      )}
      {videos.length > 0 && (
        <div className="moment-media-video-list">
          {videos.map((item, index) => (
            <figure key={item.id} className="moment-media-video-item">
              <video
                src={item.url}
                className="moment-media-video"
                controls
                playsInline
                preload="none"
                aria-label={`心迹视频 ${index + 1}${item.name ? `：${item.name}` : ''}`}
              />
              <figcaption className="moment-media-video-caption">
                <span>视频{videos.length > 1 ? ` ${index + 1} / ${videos.length}` : ''}</span>
                {item.name && <span className="moment-media-video-name">{item.name}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
