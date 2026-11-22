import { NextResponse } from 'next/server';
import { islandRepository } from '@/server/island/islandRepository';
import {
  getCurrentProfile,
  getIslandOnlineCount,
  islandErrorResponse,
  requireCurrentProfile
} from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token')?.trim() || '';
    const profile = getCurrentProfile(request);
    const preview = islandRepository.previewInvite(token, profile);
    return NextResponse.json(preview);
  } catch (error) {
    return islandErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = requireCurrentProfile(request);
    const body = (await request.json().catch(() => ({}))) as {
      inviteToken?: string;
    };
    const island = await islandRepository.joinByInvite(body?.inviteToken, profile);
    return NextResponse.json({
      island: islandRepository.presentSummary(island, profile, {
        onlineCount: getIslandOnlineCount(island.id)
      })
    });
  } catch (error) {
    return islandErrorResponse(error);
  }
}
