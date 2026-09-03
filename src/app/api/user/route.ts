import { NextResponse } from 'next/server';
import { profileRepository } from '@/server/user/profileRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUuid(request: Request): string {
  return request.headers.get('x-neon-user-uuid')?.trim() || '';
}

function errorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '请求失败，请重试';
  const status = code === 'PROFILE_NOT_FOUND' ? 404 : code === 'USER_ID_TAKEN' ? 409 : code ? 400 : 500;
  if (status === 500) console.error('User profile request failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId')?.trim() || '';
    const publicKey = url.searchParams.get('key')?.trim() || '';
    const uuid = getUuid(request);
    const profile = userId ? (publicKey ? profileRepository.getByPublicKey(publicKey) : profileRepository.getByUserId(userId)) : profileRepository.getByUuid(uuid);

    if (!profile) return NextResponse.json({ error: '没有找到这个人', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ profile: profileRepository.toPublic(profile), isOwner: Boolean(uuid && profile.uuid === uuid) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const profile = profileRepository.ensureProfile(input);
    await profileRepository.writeQueue;
    return NextResponse.json({ profile: profileRepository.toPublic(profile), isOwner: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const uuid = getUuid(request);
    const input = await request.json();
    const profile = profileRepository.updateProfile(uuid, input);
    await profileRepository.writeQueue;
    return NextResponse.json({ profile: profileRepository.toPublic(profile), isOwner: true });
  } catch (error) {
    return errorResponse(error);
  }
}
