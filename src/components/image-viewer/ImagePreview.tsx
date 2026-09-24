'use client';

import { useState, type ReactNode } from 'react';
import { ImageViewer, type ImageViewerItem } from './ImageViewer';

type Props = {
  images: ImageViewerItem[];
  imageId: string;
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: 'photo' | 'sticker';
};

/** Keep the trigger separate from the image so existing crops and layouts stay intact. */
export function ImagePreview({ images, imageId, children, className = '', title, variant = 'photo' }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentIndex = images.findIndex((item) => item.id === selectedId);
  const item = images.find((image) => image.id === imageId);
  return <>
    <button type="button" className={`image-preview-trigger ${className}`} aria-label={`查看${variant === 'sticker' ? '表情' : '大图'}：${item?.name || '图片'}`} aria-haspopup="dialog" onClick={() => setSelectedId(imageId)}>{children}</button>
    {currentIndex >= 0 && <ImageViewer images={images} currentIndex={currentIndex} onSelect={setSelectedId} onClose={() => setSelectedId(null)} title={title} variant={variant} />}
  </>;
}
