import { momentRepository } from '@/server/moment/momentRepository';
import { assertAdminMutationRequest, getViewer, momentErrorResponse, publicMoment } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const moment = momentRepository.getMoment(momentId);
    if (!moment) throw Object.assign(new Error('这条心迹不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
    return Response.json({ item: publicMoment(moment, await getViewer(request), 2) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try {
    const { momentId } = await context.params;
    const viewer = await getViewer(request);
    const moment = momentRepository.getMoment(momentId);
    if (!moment) throw Object.assign(new Error('这条心迹不存在或已被删除'), { code: 'MOMENT_NOT_FOUND' });
    const isOwner = Boolean(viewer.uuid && viewer.uuid === moment.ownerUuid);
    assertAdminMutationRequest(request, viewer, isOwner);
    await momentRepository.deleteMoment(momentId, viewer.uuid, { isAdmin: viewer.isAdmin });
    return new Response(null, { status: 204 });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
