import { NextResponse } from 'next/server';
import { islandRepository } from '@/server/island/islandRepository';
import { profileRepository } from '@/server/user/profileRepository';
import { getCurrentProfile, getIslandOnlineCount, islandErrorResponse } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { userId } = await context.params;
    const viewerProfile = getCurrentProfile(request);
    const targetProfile = profileRepository.getByUserId(userId);
    if (!targetProfile || targetProfile.isSystem) {
      return NextResponse.json({ accessible: false, isOwner: false });
    }

    const isOwner = Boolean(viewerProfile && viewerProfile.publicKey === targetProfile.publicKey);
    if (isOwner) {
      const island = await islandRepository.ensurePersonalIsland(targetProfile);
      return NextResponse.json({
        accessible: true,
        isOwner: true,
        island: islandRepository.presentSummary(island, viewerProfile, {
          onlineCount: getIslandOnlineCount(island.id)
        })
      });
    }

    const island = islandRepository.getIslandByOwnerPublicKey(targetProfile.publicKey);
    if (!island || !viewerProfile || !island.members?.[viewerProfile.publicKey]) {
      return NextResponse.json({ accessible: false, isOwner: false });
    }

    return NextResponse.json({
      accessible: true,
      isOwner: false,
      island: islandRepository.presentSummary(island, viewerProfile, {
        onlineCount: getIslandOnlineCount(island.id)
      })
    });
  } catch (error) {
    return islandErrorResponse(error);
  }
}
