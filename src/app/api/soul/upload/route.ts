import { randomUUID } from 'crypto';
import { mkdir, open, unlink } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};
const PREVIEW_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/json': 'json',
  'text/csv': 'csv'
};
const SAFE_PREVIEW_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv', 'xls', 'xlsx', 'ppt', 'pptx']);

function safeDisplayName(name: string): string {
  const baseName = path.basename(name || '未命名文件');
  return baseName.replace(/[^\p{L}\p{N}._()\-\s]/gu, '_').slice(0, 160) || '未命名文件';
}

function decodeFileName(value: string | null): string {
  if (!value) return '未命名文件';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getStoredExtension(name: string, mimeType: string): string {
  if (IMAGE_EXTENSIONS[mimeType]) return IMAGE_EXTENSIONS[mimeType];
  if (PREVIEW_MIME_EXTENSIONS[mimeType]) return PREVIEW_MIME_EXTENSIONS[mimeType];
  const extension = path.extname(name).slice(1).toLowerCase();
  return SAFE_PREVIEW_EXTENSIONS.has(extension) ? extension : 'bin';
}

export async function POST(request: Request) {
  try {
    if (!request.body) return NextResponse.json({ error: '请选择文件' }, { status: 400 });

    const displayName = safeDisplayName(decodeFileName(request.headers.get('x-file-name')));
    const mimeType = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
    const extension = getStoredExtension(displayName, mimeType);
    const storedName = `${randomUUID()}.${extension}`;
    const uploadDirectory = path.join(process.cwd(), 'public', 'uploads', 'soul');
    const storedPath = path.join(uploadDirectory, storedName);
    await mkdir(uploadDirectory, { recursive: true });

    const reader = request.body.getReader();
    const fileHandle = await open(storedPath, 'wx');
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        await fileHandle.write(value);
        size += value.byteLength;
      }
    } catch (error) {
      await unlink(storedPath).catch(() => undefined);
      throw error;
    } finally {
      await fileHandle.close();
    }

    if (size <= 0) {
      await unlink(storedPath).catch(() => undefined);
      return NextResponse.json({ error: '不能上传空文件' }, { status: 400 });
    }

    return NextResponse.json({
      url: `/uploads/soul/${storedName}`,
      name: displayName,
      size,
      mimeType
    });
  } catch (error) {
    console.error('Soul file upload failed:', error);
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 500 });
  }
}
