export function formatMomentTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const difference = Date.now() - timestamp;
  if (difference < 60_000) return '刚刚';
  if (difference < 60 * 60_000) return `${Math.floor(difference / 60_000)} 分钟前`;
  if (difference < 24 * 60 * 60_000) return `${Math.floor(difference / (60 * 60_000))} 小时前`;
  const date = new Date(timestamp);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

import type { MomentBlock, MomentImageBlock } from './types';

export function splitMomentParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '')
    .split(/\n(?:[ \t]*\n)+/)
    .filter((block) => block.trim().length > 0);
}

/**
 * Separate posts whose images all sit cleanly at the end (rendered via the standard
 * MomentMediaView grid) from true interleaved articles (text -> image -> text).
 */
export function splitTrailingImages(blocks?: MomentBlock[]): {
  interleavedBlocks: MomentBlock[];
  trailingImages: MomentImageBlock[];
  hasInterleavedImages: boolean;
} {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { interleavedBlocks: [], trailingImages: [], hasInterleavedImages: false };
  }
  const firstImageIndex = blocks.findIndex((block) => block.type === 'image');
  if (firstImageIndex < 0) {
    return { interleavedBlocks: blocks, trailingImages: [], hasInterleavedImages: false };
  }
  const hasTextAfterImage = blocks.slice(firstImageIndex + 1).some((block) => block.type === 'text' && block.text.trim().length > 0);
  if (hasTextAfterImage) {
    return { interleavedBlocks: blocks, trailingImages: [], hasInterleavedImages: true };
  }
  return {
    interleavedBlocks: blocks.slice(0, firstImageIndex),
    trailingImages: blocks.slice(firstImageIndex).filter((block): block is MomentImageBlock => block.type === 'image'),
    hasInterleavedImages: false
  };
}
