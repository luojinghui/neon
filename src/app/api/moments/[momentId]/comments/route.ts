import { NextResponse } from 'next/server';
import { momentRepository } from '@/server/moment/momentRepository';
import { getViewer, momentErrorResponse, publicComment, requireCurrentProfile } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const viewer = await getViewer(request);
    const items = momentRepository.listComments(momentId).map((comment: unknown) => publicComment(comment, viewer));
    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const profile = requireCurrentProfile(request);
    const input = await request.json();
    const comment = await momentRepository.createComment(momentId, profile.uuid, input);
    const viewer = await getViewer(request);
    return NextResponse.json({ item: publicComment(comment, viewer) }, { status: 201 });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
