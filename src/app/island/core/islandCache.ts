'use client';

import type { IslandDetail, IslandSkyResponse } from './types';

const SKY_CACHE_PREFIX = 'neon:island:sky:v1:';
const DETAIL_CACHE_PREFIX = 'neon:island:detail:v1:';

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readCachedSky(uuid: string): IslandSkyResponse | null {
  const storage = safeStorage();
  if (!storage || !uuid) return null;
  try {
    const raw = storage.getItem(`${SKY_CACHE_PREFIX}${uuid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IslandSkyResponse;
    if (!parsed?.ownIsland?.id || !Array.isArray(parsed.joinedIslands)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSky(uuid: string, sky: IslandSkyResponse): void {
  const storage = safeStorage();
  if (!storage || !uuid) return;
  try {
    storage.setItem(`${SKY_CACHE_PREFIX}${uuid}`, JSON.stringify(sky));
  } catch {
    // Ignore storage quota errors.
  }
}

export function readCachedIsland(uuid: string, islandId: string): IslandDetail | null {
  const storage = safeStorage();
  if (!storage || !uuid || !islandId) return null;
  try {
    const raw = storage.getItem(`${DETAIL_CACHE_PREFIX}${uuid}:${islandId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IslandDetail;
    if (!parsed?.id || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedIsland(uuid: string, detail: IslandDetail): void {
  const storage = safeStorage();
  if (!storage || !uuid || !detail?.id) return;
  try {
    storage.setItem(`${DETAIL_CACHE_PREFIX}${uuid}:${detail.id}`, JSON.stringify(detail));
  } catch {
    // Ignore storage quota errors.
  }
}

export function removeCachedIsland(uuid: string, islandId: string): void {
  const storage = safeStorage();
  if (!storage || !uuid || !islandId) return;
  try {
    storage.removeItem(`${DETAIL_CACHE_PREFIX}${uuid}:${islandId}`);
  } catch {
    // Ignore storage errors.
  }
}
