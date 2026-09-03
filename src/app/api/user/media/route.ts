import { randomUUID } from 'crypto';
import { mkdir, open, unlink } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { profileRepository } from '@/server/user/profileRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export async function POST(request: Request) {
  let storedPath = '';
  try {
    const uuid = request.headers.get('x-neon-user-uuid')?.trim() || '';
    if (!profileRepository.getByUuid(uuid)) return NextResponse.json({ error: '个人资料不存在，请刷新页面重试' }, { status: 404 });
    if (!request.body) return NextResponse.json({ error: '请选择图片' }, { status: 400 });

    const kind = request.headers.get('x-profile-media-kind') === 'banner' ? 'banner' : 'avatar';
    const mimeType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const extension = IMAGE_EXTENSIONS[mimeType];
    if (!extension) return NextResponse.json({ error: '仅支持 PNG、JPG、WebP 或 GIF 图片' }, { status: 415 });

    const sizeLimit = kind === 'avatar' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > sizeLimit) return NextResponse.json({ error: kind === 'avatar' ? '头像不能超过 20MB' : '背景图不能超过 10MB' }, { status: 413 });

    const storedName = `${randomUUID()}.${extension}`;
    const uploadDirectory = path.join(process.cwd(), 'public', 'uploads', 'profile');
    storedPath = path.join(uploadDirectory, storedName);
    await mkdir(uploadDirectory, { recursive: true });

    const reader = request.body.getReader();
    const fileHandle = await open(storedPath, 'wx');
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        size += value.byteLength;
        if (size > sizeLimit) throw Object.assign(new Error(kind === 'avatar' ? '头像不能超过 20MB' : '背景图不能超过 10MB'), { code: 'FILE_TOO_LARGE' });
        await fileHandle.write(value);
      }
    } finally {
      await fileHandle.close();
    }

    if (size <= 0) throw Object.assign(new Error('不能上传空图片'), { code: 'EMPTY_FILE' });
    return NextResponse.json({ url: `/uploads/profile/${storedName}`, size, mimeType, kind });
  } catch (error) {
    if (storedPath) await unlink(storedPath).catch(() => undefined);
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    const status = code === 'FILE_TOO_LARGE' ? 413 : code === 'EMPTY_FILE' ? 400 : 500;
    if (status === 500) console.error('Profile media upload failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '上传失败，请重试' }, { status });
  }
}
