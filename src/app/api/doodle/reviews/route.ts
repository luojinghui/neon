import { NextResponse } from 'next/server';
import { doodleReviewRepository } from '@/server/doodle/reviewRepository';
import { profileRepository } from '@/server/user/profileRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function errorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '审核图片提交失败，请重试';
  const status = code === 'PROFILE_NOT_FOUND' ? 404 : code === 'IMAGE_TOO_LARGE' ? 413 : code ? 400 : 500;
  if (status === 500) console.error('Doodle review request failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}

function requireImage(value: FormDataEntryValue | null, label: string): File {
  if (!value || typeof value === 'string' || value.size === 0) throw Object.assign(new Error(`${label}不能为空`), { code: 'IMAGE_EMPTY' });
  if (value.size > MAX_IMAGE_BYTES) throw Object.assign(new Error(`${label}不能超过 6MB`), { code: 'IMAGE_TOO_LARGE' });
  return value;
}

export async function POST(request: Request) {
  try {
    const ownerUuid = request.headers.get('x-neon-user-uuid')?.trim() || '';
    if (!profileRepository.getByUuid(ownerUuid)) {
      return NextResponse.json({ error: '个人资料不存在，请刷新页面重试', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    }
    const form = await request.formData();
    const original = requireImage(form.get('original'), '拍摄原图');
    const processed = requireImage(form.get('processed'), '生成成品');
    const review = await doodleReviewRepository.createReview(
      {
        ownerUuid,
        originalMimeType: original.type,
        processedMimeType: processed.type,
        title: form.get('title'),
        style: form.get('style'),
        template: form.get('template'),
        shareId: form.get('shareId'),
        reviewKey: form.get('reviewKey')
      },
      Buffer.from(await original.arrayBuffer()),
      Buffer.from(await processed.arrayBuffer())
    );
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
