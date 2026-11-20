'use client';

import { Button } from '@/components/ui/button';
import { useCallback, useMemo, useState } from 'react';
import { LinkifiedText } from '@/components/LinkifiedText';
import { ImageViewer } from '@/components/image-viewer/ImageViewer';
import type { MomentBlock, MomentImageBlock } from '../types';

type Props = {
  text: string;
  blocks?: MomentBlock[];
  immersive?: boolean;
};

type BodyGroup =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'images'; key: string; images: MomentImageBlock[] };

export function MomentBody({ text, blocks, immersive = false }: Props) {
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
  const inlineImages = useMemo(
    () => (hasBlocks ? blocks.filter((block): block is MomentImageBlock => block.type === 'image') : []),
    [blocks, hasBlocks]
  );
  const groups = useMemo<BodyGroup[]>(() => {
    if (!hasBlocks) return [];
    const result: BodyGroup[] = [];
    blocks.forEach((block, index) => {
      if (block.type === 'text') {
        const normalized = block.text.replace(/\r\n?/g, '\n');
        if (normalized.trim().length > 0) result.push({ kind: 'text', key: `t-${index}`, text: normalized });
      } else {
        const prev = result[result.length - 1];
        if (prev && prev.kind === 'images') prev.images.push(block);
        else result.push({ kind: 'images', key: block.id, images: [block] });
      }
    });
    return result;
  }, [blocks, hasBlocks]);

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const selectedIndex = inlineImages.findIndex((item) => item.id === selectedImageId);
  const closeViewer = useCallback(() => setSelectedImageId(null), []);

  if (!hasBlocks) {
    const normalized = text ? text.replace(/\r\n?/g, '\n') : '';
    if (!normalized.trim()) return null;
    return <p><LinkifiedText content={normalized} /></p>;
  }

  return (
    <>
      {groups.map((group) => {
        if (group.kind === 'text') {
          return <p key={group.key}><LinkifiedText content={group.text} /></p>;
        }
        if (group.images.length === 1) {
          const block = group.images[0];
          return (
            <figure key={block.id} className={`moment-inline-figure${immersive ? ' is-immersive' : ''}`}>
              <Button
                variant="ghost"
                data-ui-surface
                type="button"
                className="moment-inline-image-trigger"
                aria-label={`查看正文图片${block.alt ? `：${block.alt}` : ''}`}
                aria-haspopup="dialog"
                onClick={() => setSelectedImageId(block.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.url}
                  alt={block.alt || block.name || '正文图片'}
                  className="moment-inline-image"
                  loading="lazy"
                  decoding="async"
                />
              </Button>
            </figure>
          );
        }
        return (
          <div
            key={group.key}
            className="moment-inline-grid"
            data-count={Math.min(group.images.length, 3)}
            role="group"
            aria-label={`共 ${group.images.length} 张正文图片`}
          >
            {group.images.map((block, idx) => (
              <div key={block.id} className="moment-inline-grid-item">
                <Button
                  variant="ghost"
                  data-ui-surface
                  type="button"
                  className="moment-inline-grid-tile"
                  aria-label={`查看第 ${idx + 1} 张正文图片${block.alt ? `：${block.alt}` : ''}`}
                  aria-haspopup="dialog"
                  onClick={() => setSelectedImageId(block.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={block.url}
                    alt={block.alt || block.name || `正文图片 ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                  />
                </Button>
              </div>
            ))}
          </div>
        );
      })}
      {selectedIndex >= 0 && (
        <ImageViewer
          images={inlineImages}
          currentIndex={selectedIndex}
          onSelect={setSelectedImageId}
          onClose={closeViewer}
          title="星河影像"
        />
      )}
    </>
  );
}
