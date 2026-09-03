import { NextResponse } from 'next/server';
import { doodleReviewRepository } from '@/server/doodle/reviewRepository';
import { profileRepository } from '@/server/user/profileRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
type RouteContext = { params: Promise<{ reviewId: string }> };

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
  if (declaredSize > MAX_IMAGE_BYTES) throw Object.assign(new Error('生成成品不能超过 6MB'), { code: 'IMAGE_TOO_LARGE' });
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('生成成品不能超过 6MB'), { code: 'IMAGE_TOO_LARGE' });
  return buffer;
}

function errorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '审核图片更新失败，请重试';
  const status =
    code === 'PROFILE_NOT_FOUND' || code === 'REVIEW_NOT_FOUND'
      ? 404
      : code === 'REVIEW_FORBIDDEN'
        ? 403
        : code === 'REVIEW_GONE'
          ? 410
          : code === 'IMAGE_TOO_LARGE'
            ? 413
            : code
              ? 400
              : 500;
  if (status === 500) console.error('Doodle review update failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { reviewId } = await context.params;
    const ownerUuid = request.headers.get('x-neon-user-uuid')?.trim() || '';
    if (!profileRepository.getByUuid(ownerUuid)) {
      return NextResponse.json({ error: '个人资料不存在，请刷新页面重试', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    }
    const review = await doodleReviewRepository.updateProcessed(
      reviewId,
      ownerUuid,
      {
        processedMimeType: request.headers.get('content-type') || '',
        title: readHeader(request, 'x-doodle-title'),
        style: readHeader(request, 'x-doodle-style'),
        template: readHeader(request, 'x-doodle-template'),
        shareId: readHeader(request, 'x-doodle-share-id')
      },
      await readImage(request)
    );
    return NextResponse.json({ review });
  } catch (error) {
    return errorResponse(error);
  }
}
