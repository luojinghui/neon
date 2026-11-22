import { NextResponse } from 'next/server';
import { authenticateCookieHeader } from '@/server/admin/auth';
import { profileRepository } from '@/server/user/profileRepository';

const ONLINE_COUNT_KEY = Symbol.for('neon.island.onlineCount.v1');
const EVICT_MEMBER_KEY = Symbol.for('neon.island.evictMember.v1');
const BROADCAST_UPDATED_KEY = Symbol.for('neon.island.broadcastUpdated.v1');

export type IslandViewer = {
  uuid: string;
  isAdmin: boolean;
};

export function getUuid(request: Request): string {
  return request.headers.get('x-neon-user-uuid')?.trim().toLowerCase() || '';
}

export async function getViewer(request: Request): Promise<IslandViewer> {
  const uuid = getUuid(request);
  let isAdmin = false;
  try {
    const admin = await authenticateCookieHeader(request.headers.get('cookie') || '');
    isAdmin = admin?.role === 'super_admin';
  } catch (error) {
    console.error('Island admin session could not be verified:', error);
  }
  return { uuid, isAdmin };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getCurrentProfile(request: Request) {
  const uuid = getUuid(request);
  if (!uuid || !UUID_PATTERN.test(uuid)) return null;
  const existing = profileRepository.getByUuid(uuid);
  if (existing) return existing;
  try {
    return profileRepository.ensureProfile({ uuid });
  } catch {
    return null;
  }
}

export function requireCurrentProfile(request: Request) {
  const profile = getCurrentProfile(request);
  if (!profile) {
    throw Object.assign(new Error('个人资料不存在，请刷新页面重试'), { code: 'PROFILE_NOT_FOUND' });
  }
  return profile;
}

export function getIslandOnlineCount(islandId: string): number {
  const getter = (globalThis as Record<symbol, unknown>)[ONLINE_COUNT_KEY];
  if (typeof getter === 'function') {
    return Number((getter as (id: string) => number)(islandId)) || 0;
  }
  return 0;
}

export function evictIslandMemberSocket(islandId: string, publicKey: string): void {
  const evict = (globalThis as Record<symbol, unknown>)[EVICT_MEMBER_KEY];
  if (typeof evict === 'function') {
    (evict as (id: string, key: string) => void)(islandId, publicKey);
  }
}

export function broadcastIslandUpdatedSocket(islandId: string, patch: Record<string, unknown>): void {
  const broadcast = (globalThis as Record<symbol, unknown>)[BROADCAST_UPDATED_KEY];
  if (typeof broadcast === 'function') {
    (broadcast as (id: string, data: Record<string, unknown>) => void)(islandId, patch);
  }
}

export function islandErrorResponse(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : '请求失败，请重试';
  const status =
    code === 'PROFILE_NOT_FOUND' ||
    code === 'ISLAND_NOT_FOUND' ||
    code === 'ISLAND_INVITE_INVALID' ||
    code === 'ISLAND_ITEM_NOT_FOUND' ||
    code === 'ISLAND_MEMBER_NOT_FOUND'
      ? 404
      : code === 'ISLAND_FORBIDDEN' ||
          code === 'ISLAND_EDIT_FORBIDDEN' ||
          code === 'ISLAND_ITEM_FORBIDDEN' ||
          code === 'ISLAND_PASSCODE_MISMATCH'
        ? 403
        : code === 'ISLAND_INVITE_EXPIRED'
          ? 410
          : code === 'ISLAND_MEDIA_TOO_LARGE' || code === 'REQUEST_TOO_LARGE'
            ? 413
            : code === 'ISLAND_STORAGE_UNAVAILABLE'
              ? 503
              : code
                ? 400
                : 500;
  if (status === 500) console.error('Island request failed:', error);
  return NextResponse.json({ error: message, code }, { status });
}
