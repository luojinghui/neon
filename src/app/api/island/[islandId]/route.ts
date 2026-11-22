import { NextResponse } from 'next/server';
import { islandRepository } from '@/server/island/islandRepository';
import {
  broadcastIslandUpdatedSocket,
  evictIslandMemberSocket,
  getCurrentProfile,
  getIslandOnlineCount,
  getViewer,
  islandErrorResponse,
  requireCurrentProfile
} from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ islandId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { islandId } = await context.params;
    const viewer = await getViewer(request);
    const profile = getCurrentProfile(request);
    if (!profile && !viewer.isAdmin) {
      throw Object.assign(new Error('个人资料不存在，请刷新页面重试'), { code: 'PROFILE_NOT_FOUND' });
    }
    const island = islandRepository.getIslandById(islandId);
    if (!island) {
      throw Object.assign(new Error('浮岛不存在'), { code: 'ISLAND_NOT_FOUND' });
    }
    if (!islandRepository.canAccessIsland(island, profile, { isAdmin: viewer.isAdmin })) {
      throw Object.assign(new Error('没有访问该浮岛的权限'), { code: 'ISLAND_FORBIDDEN' });
    }
    if (profile && island.members?.[profile.publicKey]) {
      await islandRepository.touchVisit(island.id, profile);
    }
    return NextResponse.json({
      island: islandRepository.presentDetail(island, profile, {
        isAdmin: viewer.isAdmin,
        onlineCount: getIslandOnlineCount(island.id)
      })
    });
  } catch (error) {
    return islandErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { islandId } = await context.params;
    const profile = requireCurrentProfile(request);
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      skin?: string;
      paper?: string;
      regenerateInvite?: boolean;
      removeMemberPublicKey?: string;
    };
    const updated = await islandRepository.updateSettings(islandId, profile, body);
    if (typeof body?.removeMemberPublicKey === 'string' && body.removeMemberPublicKey.trim()) {
      evictIslandMemberSocket(updated.id, body.removeMemberPublicKey.trim());
    }
    if (typeof body?.name === 'string' || typeof body?.skin === 'string' || typeof body?.paper === 'string') {
      broadcastIslandUpdatedSocket(updated.id, {
        name: updated.name,
        skin: updated.skin,
        paper: updated.paper,
        updatedAt: updated.updatedAt
      });
    }
    return NextResponse.json({
      island: islandRepository.presentSummary(updated, profile, {
        onlineCount: getIslandOnlineCount(updated.id)
      })
    });
  } catch (error) {
    return islandErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { islandId } = await context.params;
    const profile = requireCurrentProfile(request);
    const result = await islandRepository.leaveIsland(islandId, profile);
    evictIslandMemberSocket(islandId, profile.publicKey);
    return NextResponse.json({ ok: result.ok });
  } catch (error) {
    return islandErrorResponse(error);
  }
}
