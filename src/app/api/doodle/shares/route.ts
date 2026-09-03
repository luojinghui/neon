import { NextResponse } from 'next/server';
import { doodleShareRepository } from '@/server/doodle/shareRepository';
import { profileRepository } from '@/server/user/profileRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function getUuid(request: Request): string {
  return request.headers.get('x-neon-user-uuid')?.trim() || '';
}

function readHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim() || '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readImage(request: Request): Promise<Buffer> {
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_IMAGE_BYTES) throw Object.assign(new Error('涂鸦图片不能超过 6MB'), { code: 'IMAGE_TOO_LARGE' });
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('涂鸦图片不能超过 6MB'), { code: 'IMAGE_TOO_LARGE' });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function errorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '请求失败，请重试';
  const status =
    code === 'PROFILE_NOT_FOUND' || code === 'SHARE_NOT_FOUND'
      ? 404
      : code === 'SHARE_FORBIDDEN'
        ? 403
        : code === 'SHARE_GONE'
          ? 410
          : code === 'IMAGE_TOO_LARGE'
            ? 413
            : code
              ? 400
              : 500;
  if (status === 500) console.error('Doodle share request failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: Request) {
  try {
    const uuid = getUuid(request);
    if (!profileRepository.getByUuid(uuid)) return NextResponse.json({ error: '个人资料不存在，请刷新页面重试', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ shares: doodleShareRepository.listOwnerShares(uuid) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerUuid = getUuid(request);
    if (!profileRepository.getByUuid(ownerUuid)) return NextResponse.json({ error: '个人资料不存在，请刷新页面重试', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    const image = await readImage(request);
    const share = await doodleShareRepository.createShare(
      {
        ownerUuid,
        mimeType: request.headers.get('content-type') || '',
        title: readHeader(request, 'x-doodle-title'),
        style: readHeader(request, 'x-doodle-style'),
        template: readHeader(request, 'x-doodle-template'),
        reviewKey: readHeader(request, 'x-doodle-review-key')
      },
      image
    );
    const shareUrl = new URL(`/doodle/s/${share.id}`, request.url).toString();
    return NextResponse.json({ share: doodleShareRepository.toPublic(share), shareUrl }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
