import { NextResponse } from 'next/server';
import { islandRepository } from '@/server/island/islandRepository';
import { islandErrorResponse, requireCurrentProfile } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ islandId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > MAX_REQUEST_BYTES) {
      throw Object.assign(new Error('图片大小不能超过 8 MB'), { code: 'ISLAND_MEDIA_TOO_LARGE' });
    }
    const { islandId } = await context.params;
    const profile = requireCurrentProfile(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || file.size <= 0) {
      throw Object.assign(new Error('请选择要上传的图片'), { code: 'ISLAND_MEDIA_INVALID' });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await islandRepository.saveMedia(islandId, profile, {
      buffer,
      mimeType: file.type,
      name: file.name
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return islandErrorResponse(error);
  }
}
