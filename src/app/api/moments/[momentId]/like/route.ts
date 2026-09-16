import { NextResponse } from 'next/server';
import { momentRepository } from '@/server/moment/momentRepository';
import { momentErrorResponse, requireCurrentProfile } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const profile = requireCurrentProfile(request);
    const input = await request.json().catch(() => null);
    const result = await momentRepository.setMomentLiked(momentId, profile.uuid, input?.liked);
    return NextResponse.json(result);
  } catch (error) {
    return momentErrorResponse(error);
  }
}
