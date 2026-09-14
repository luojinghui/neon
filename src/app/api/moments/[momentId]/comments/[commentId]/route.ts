import { momentRepository } from '@/server/moment/momentRepository';
import { assertAdminMutationRequest, getViewer, momentErrorResponse, publicComment, requireCurrentProfile } from '../../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ momentId: string; commentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { momentId, commentId } = await context.params;
    const profile = requireCurrentProfile(request);
    const input = await request.json();
    const comment = await momentRepository.updateComment(momentId, commentId, profile.uuid, input);
    return Response.json({ item: publicComment(comment, { uuid: profile.uuid, isAdmin: false }) });
  } catch (error) {
    return momentErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { momentId, commentId } = await context.params;
    const viewer = await getViewer(request);
    const comment = momentRepository.listComments(momentId).find((item: { id: string }) => item.id === commentId);
    if (!comment) throw Object.assign(new Error('评论不存在或已被删除'), { code: 'COMMENT_NOT_FOUND' });
    const isOwner = Boolean(viewer.uuid && viewer.uuid === comment.ownerUuid);
    assertAdminMutationRequest(request, viewer, isOwner);
    await momentRepository.deleteComment(momentId, commentId, viewer.uuid, { isAdmin: viewer.isAdmin });
    return new Response(null, { status: 204 });
  } catch (error) {
    return momentErrorResponse(error);
  }
}
