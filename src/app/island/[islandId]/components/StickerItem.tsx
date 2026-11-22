'use client';

import type { ReactNode } from 'react';
import styles from '../island-canvas.module.css';

export interface StickerPreset {
  id: string;
  label: string;
  defaultW: number;
  defaultH: number;
}

export interface TapePreset {
  id: string;
  label: string;
  defaultW: number;
  defaultH: number;
}

export const STICKER_PRESETS: StickerPreset[] = [
  { id: 'star', label: '星星', defaultW: 112, defaultH: 112 },
  { id: 'moon', label: '弯月', defaultW: 112, defaultH: 112 },
  { id: 'cloud', label: '云朵', defaultW: 136, defaultH: 92 },
  { id: 'flower', label: '小花', defaultW: 112, defaultH: 112 },
  { id: 'heart', label: '爱心', defaultW: 108, defaultH: 104 },
  { id: 'stamp', label: '邮票', defaultW: 120, defaultH: 120 },
  { id: 'boat', label: '纸船', defaultW: 136, defaultH: 96 },
  { id: 'sparkle', label: '星芒', defaultW: 108, defaultH: 108 }
];

export const TAPE_PRESETS: TapePreset[] = [
  { id: 'stripe-peach', label: '暖橘斜纹', defaultW: 200, defaultH: 40 },
  { id: 'dots-sky', label: '晴蓝波点', defaultW: 200, defaultH: 40 },
  { id: 'stars-lavender', label: '鸢紫星点', defaultW: 200, defaultH: 40 },
  { id: 'grid-mint', label: '薄荷方格', defaultW: 200, defaultH: 40 }
];

function renderStickerSvg(presetId: string): ReactNode {
  switch (presetId) {
    case 'moon':
      return (
        <svg viewBox="0 0 100 100" className={styles.stickerSvg} aria-hidden="true">
          <path
            d="M66 18C50 18 37 31 37 47c0 17 13 30 30 30 6 0 12-2 17-5-6 11-18 18-31 18-20 0-36-16-36-36S33 18 53 18c5 0 9 0 13 0Z"
            fill="#FFD978"
            stroke="#D99B26"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="72" cy="30" r="4" fill="#FFF3C4" />
          <circle cx="82" cy="44" r="2.6" fill="#FFD978" />
        </svg>
      );
    case 'cloud':
      return (
        <svg viewBox="0 0 130 88" className={styles.stickerSvg} aria-hidden="true">
          <path
            d="M34 72h64c14 0 24-10 24-22 0-11-8-20-19-21C99 16 87 8 73 8c-15 0-28 10-31 24-2-.4-5-.6-8-.6-14 0-24 9.5-24 20.6C10 63 20 72 34 72Z"
            fill="#F5FBFF"
            stroke="#94C5E8"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="54" cy="47" r="2.8" fill="#5D8EB5" />
          <circle cx="76" cy="47" r="2.8" fill="#5D8EB5" />
          <path d="M60 54c3 3 7 3 10 0" fill="none" stroke="#5D8EB5" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      );
    case 'flower':
      return (
        <svg viewBox="0 0 100 100" className={styles.stickerSvg} aria-hidden="true">
          <g fill="#FFB7C8" stroke="#E07592" strokeWidth="3">
            <circle cx="50" cy="24" r="15" />
            <circle cx="74" cy="42" r="15" />
            <circle cx="65" cy="70" r="15" />
            <circle cx="35" cy="70" r="15" />
            <circle cx="26" cy="42" r="15" />
          </g>
          <circle cx="50" cy="50" r="14" fill="#FFE07D" stroke="#D99B26" strokeWidth="3" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 100 94" className={styles.stickerSvg} aria-hidden="true">
          <path
            d="M50 84S12 60 12 33c0-13 10-23 22-23 8 0 14 4 16 10 2-6 8-10 16-10 12 0 22 10 22 23 0 27-38 51-38 51Z"
            fill="#FF8A9E"
            stroke="#D9536F"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M26 30c0-6 4-10 9-11" fill="none" stroke="#FFD6DE" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'stamp':
      return (
        <svg viewBox="0 0 110 110" className={styles.stickerSvg} aria-hidden="true">
          <rect
            x="10"
            y="10"
            width="90"
            height="90"
            rx="8"
            fill="#FFF7EA"
            stroke="#D8A46F"
            strokeWidth="3.5"
            strokeDasharray="6 5"
          />
          <rect x="20" y="20" width="70" height="70" rx="4" fill="#DDF0FF" stroke="#85B3D6" strokeWidth="2.5" />
          <circle cx="42" cy="42" r="9" fill="#FFD166" />
          <path d="M22 76l20-20 14 14 12-12 20 18v12H22Z" fill="#7AC7A2" />
        </svg>
      );
    case 'boat':
      return (
        <svg viewBox="0 0 130 90" className={styles.stickerSvg} aria-hidden="true">
          <path d="M16 56h98l-14 22H30L16 56Z" fill="#FFFDF8" stroke="#6E95B8" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M65 14v42H34L65 14Z" fill="#BFE2FF" stroke="#6E95B8" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M65 22v34h28L65 22Z" fill="#FFD3B5" stroke="#D1885C" strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg viewBox="0 0 100 100" className={styles.stickerSvg} aria-hidden="true">
          <path
            d="M50 8c4 24 18 38 42 42-24 4-38 18-42 42-4-24-18-38-42-42 24-4 38-18 42-42Z"
            fill="#C7B6FF"
            stroke="#7F66D9"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="80" cy="22" r="5" fill="#FFD978" />
          <circle cx="22" cy="78" r="4" fill="#FF9EB5" />
        </svg>
      );
    case 'star':
    default:
      return (
        <svg viewBox="0 0 100 100" className={styles.stickerSvg} aria-hidden="true">
          <path
            d="M50 10l12 25 27 4-20 19 5 27-24-13-24 13 5-27-20-19 27-4L50 10Z"
            fill="#FFE07D"
            stroke="#DE9C28"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="42" cy="48" r="2.6" fill="#8C5B12" />
          <circle cx="58" cy="48" r="2.6" fill="#8C5B12" />
          <path d="M46 56c2 2.5 6 2.5 8 0" fill="none" stroke="#8C5B12" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

function renderTapeSvg(presetId: string, uid: string): ReactNode {
  const patternId = `tape-pat-${presetId}-${uid}`;
  const tornPath =
    'M 6,2 L 194,2 L 198,9 L 194,16 L 199,24 L 194,32 L 197,38 L 6,38 L 2,31 L 6,24 L 1,16 L 6,9 Z';

  if (presetId === 'dots-sky') {
    return (
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={styles.stickerSvg} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
            <rect width="18" height="18" fill="rgba(125, 196, 245, 0.56)" />
            <circle cx="6" cy="6" r="2.6" fill="rgba(255, 255, 255, 0.85)" />
            <circle cx="15" cy="14" r="2" fill="rgba(255, 255, 255, 0.65)" />
          </pattern>
        </defs>
        <path d={tornPath} fill={`url(#${patternId})`} stroke="rgba(72, 138, 190, 0.35)" strokeWidth="1" />
      </svg>
    );
  }

  if (presetId === 'stars-lavender') {
    return (
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={styles.stickerSvg} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="26" height="26" patternUnits="userSpaceOnUse">
            <rect width="26" height="26" fill="rgba(186, 161, 248, 0.56)" />
            <path
              d="M13 4l1.8 5.2L20 11l-5.2 1.8L13 18l-1.8-5.2L6 11l5.2-1.8Z"
              fill="rgba(255, 246, 200, 0.9)"
            />
          </pattern>
        </defs>
        <path d={tornPath} fill={`url(#${patternId})`} stroke="rgba(126, 98, 198, 0.35)" strokeWidth="1" />
      </svg>
    );
  }

  if (presetId === 'grid-mint') {
    return (
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={styles.stickerSvg} aria-hidden="true">
        <defs>
          <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="rgba(130, 214, 178, 0.54)" />
            <path d="M14 0H0V14" fill="none" stroke="rgba(255, 255, 255, 0.65)" strokeWidth="1.2" />
          </pattern>
        </defs>
        <path d={tornPath} fill={`url(#${patternId})`} stroke="rgba(64, 148, 114, 0.35)" strokeWidth="1" />
      </svg>
    );
  }

  // Default: stripe-peach
  return (
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" className={styles.stickerSvg} aria-hidden="true">
      <defs>
        <pattern
          id={patternId}
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="16" height="16" fill="rgba(255, 176, 133, 0.56)" />
          <rect width="6" height="16" fill="rgba(255, 255, 255, 0.45)" />
        </pattern>
      </defs>
      <path d={tornPath} fill={`url(#${patternId})`} stroke="rgba(216, 120, 74, 0.35)" strokeWidth="1" />
    </svg>
  );
}

interface StickerItemProps {
  type: 'sticker' | 'tape';
  presetId: string;
  itemId: string;
}

export function StickerItem({ type, presetId, itemId }: StickerItemProps) {
  if (type === 'tape') {
    return <div className={styles.tapeRoot}>{renderTapeSvg(presetId, itemId)}</div>;
  }
  return <div className={styles.stickerRoot}>{renderStickerSvg(presetId)}</div>;
}

export function StickerPreview({ type, presetId }: { type: 'sticker' | 'tape'; presetId: string }) {
  if (type === 'tape') {
    return (
      <div style={{ width: '100%', height: 24 }}>
        {renderTapeSvg(presetId, `preview-${presetId}`)}
      </div>
    );
  }
  return <div style={{ width: 36, height: 36 }}>{renderStickerSvg(presetId)}</div>;
}
