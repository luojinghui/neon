import type { BoardItem } from './sharing';
import { boardToSvg } from './whiteboard';

export const MAX_EXPORT_EDGE = 4096;

const pad = (value: number) => String(value).padStart(2, '0');
export function boardExportName(extension: 'png' | 'svg', now = new Date()): string {
  return `whiteboard-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${extension}`;
}

export function renderBoardSvgBlob(items: BoardItem[]): Blob {
  const result = boardToSvg(items);
  if (!result) throw new Error('白板为空，无法导出');
  return new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' });
}

/** Rasterises the SVG at 2x, capped so the longest edge never exceeds MAX_EXPORT_EDGE. */
export async function renderBoardPngBlob(items: BoardItem[]): Promise<Blob> {
  const result = boardToSvg(items);
  if (!result) throw new Error('白板为空，无法导出');
  const scale = Math.min(2, MAX_EXPORT_EDGE / Math.max(result.width, result.height));
  const width = Math.max(1, Math.round(result.width * scale)), height = Math.max(1, Math.round(result.height * scale));
  const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('白板渲染失败'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器不支持图片导出');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('白板导出失败')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
