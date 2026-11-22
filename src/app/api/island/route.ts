import { NextResponse } from 'next/server';
import { islandRepository } from '@/server/island/islandRepository';
import { getIslandOnlineCount, islandErrorResponse, requireCurrentProfile } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const profile = requireCurrentProfile(request);
    const own = await islandRepository.ensurePersonalIsland(profile);
    const joined = islandRepository.listJoinedIslands(profile.publicKey);
    return NextResponse.json({
      ownIsland: islandRepository.presentSummary(own, profile, {
        onlineCount: getIslandOnlineCount(own.id)
      }),
      joinedIslands: joined.map((island: { id: string }) =>
        islandRepository.presentSummary(island, profile, {
          onlineCount: getIslandOnlineCount(island.id)
        })
      )
    });
  } catch (error) {
    return islandErrorResponse(error);
  }
}
