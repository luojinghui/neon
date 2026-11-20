import { NextResponse } from 'next/server';
import { fetchRemoteImage } from '@/server/moment/remoteImage';
import { momentErrorResponse, requireCurrentProfile } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    requireCurrentProfile(request);
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === 'string' ? body.url : '';
    const image = await fetchRemoteImage(url);
    return new NextResponse(new Uint8Array(image.buffer), {
      status: 200,
      headers: {
        'content-type': image.mimeType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-image-filename': encodeURIComponent(image.name)
      }
    });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
