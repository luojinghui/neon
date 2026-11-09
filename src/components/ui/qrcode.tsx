'use client';

import { useMemo, type HTMLAttributes } from 'react';
import QR from 'qrcode';

export interface QRCodeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  value: string;
  /** Pixel size of the square symbol. */
  size?: number;
  /** Modules colour. Scanners need strong contrast, so the default is fixed dark-on-white rather than themed. */
  color?: string;
  bgColor?: string;
}

/** Inline SVG QR code (quiet zone included) so it can be serialised for image export. */
export function QRCode({ value, size = 160, color = '#000000', bgColor = '#ffffff', style, ...props }: QRCodeProps) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try { return QR.create(value, { errorCorrectionLevel: 'M' }).modules; } catch { return null; }
  }, [value]);
  if (!matrix) return <span {...props} style={{ display: 'inline-block', width: size, height: size, ...style }} />;
  const count = matrix.size;
  const quiet = 2;
  const total = count + quiet * 2;
  let path = '';
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (matrix.get(y, x)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  return <span {...props} style={{ display: 'inline-block', lineHeight: 0, ...style }}>
    <svg role="img" aria-label="二维码" width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width={total} height={total} fill={bgColor} /><path d={path} fill={color} />
    </svg>
  </span>;
}
