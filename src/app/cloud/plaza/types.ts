import type { CloudFileInfo } from '@/action';

export type PlazaMessage = {
  messageId: string;
  content: string;
  files: CloudFileInfo[];
  createdAt: string;
  expireAt: string;
};

export type PlazaPage = { items: PlazaMessage[]; nextCursor: string | null; serverNow: string };
export type PlazaDetail = { item: PlazaMessage; serverNow: string };
export const plazaFileUrl = (fileId: string, preview = false) => `/api/cloud/plaza/file/${encodeURIComponent(fileId)}${preview ? '?preview=1' : ''}`;
export { plazaSharePath } from '../navigation';
export const isPreviewImage = (mime: string) => /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime);

export function parseJson(text: string): { valid: true; value: unknown } | { valid: false } {
  try { return { valid: true, value: JSON.parse(text) }; } catch { return { valid: false }; }
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
