'use client';

import { useEffect, useState } from 'react';
import { TEXT_HISTORY_KEY } from '@/constants/cloud';
import { getMoments } from '@/app/moments/client';
import type { CurrentProfile } from '@/app/profile/types';
import { readCachedSky } from '@/app/island/core/islandCache';
import { readRoomListCache, writeRoomListCache } from '@/app/soul/core/roomListCache';
import { SocketChatTransport } from '@/app/soul/core/socketTransport';
import { buildHomeCues, FALLBACK_CUES, type CloudHint, type DoodleHint, type HomeCue, type HomeNodeId, type HomeSignals } from './cues';

function readCloudRecent(): CloudHint | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    if (!Array.isArray(raw)) return null;
    const item = raw.find((entry) => entry && typeof entry.text === 'string' && typeof entry.timestamp === 'number') as CloudHint | undefined;
    return item?.text ? item : null;
  } catch {
    return null;
  }
}

async function readLatestDoodle(uuid: string): Promise<DoodleHint | null> {
  const response = await fetch('/api/doodle/shares', {
    headers: { 'x-neon-user-uuid': uuid },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { shares?: DoodleHint[] };
  const shares = (payload.shares || []).filter((share) => share?.id && share.state !== 'expired' && share.state !== 'deleted');
  shares.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return shares[0] || null;
}

function readLiveRooms(profile: CurrentProfile): Promise<HomeSignals['rooms'] | null> & { cancel: () => void } {
  const transport = new SocketChatTransport();
  let timer: number | null = null;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) window.clearTimeout(timer);
    transport.disconnect();
  };
  const task = new Promise<HomeSignals['rooms'] | null>((resolve) => {
    timer = window.setTimeout(() => {
      finish();
      resolve(null);
    }, 2500);
    void (async () => {
      try {
        await transport.connect({
          uuid: profile.uuid,
          publicKey: profile.publicKey,
          userId: profile.userId,
          name: profile.name,
          avatarUrl: profile.avatarUrl
        });
        const rooms = await transport.listRooms();
        if (settled) {
          resolve(null);
          return;
        }
        writeRoomListCache(profile.uuid, rooms);
        finish();
        resolve(rooms);
      } catch {
        finish();
        resolve(null);
      }
    })();
  });
  return Object.assign(task, { cancel: finish });
}

export function useHomeCues(profile: CurrentProfile | null): Record<HomeNodeId, HomeCue> {
  const [cues, setCues] = useState<Record<HomeNodeId, HomeCue>>(FALLBACK_CUES);

  useEffect(() => {
    if (!profile?.uuid) return undefined;
    let active = true;
    const signals: HomeSignals = { now: new Date() };
    const publish = (patch: Partial<HomeSignals>) => {
      Object.assign(signals, patch, { now: new Date() });
      if (active) setCues(buildHomeCues(signals));
    };

    const cachedRooms = readRoomListCache(profile.uuid);
    const sky = readCachedSky(profile.uuid);
    publish({
      rooms: cachedRooms || [],
      cloud: readCloudRecent(),
      island: sky?.ownIsland || null
    });

    void getMoments({ page: 1, pageSize: 20 })
      .then((page) => publish({ moments: page.items, momentsHaveMore: page.hasMore }))
      .catch(() => undefined);
    void readLatestDoodle(profile.uuid)
      .then((doodle) => publish({ doodle }))
      .catch(() => undefined);
    const roomsTask = readLiveRooms(profile);
    void roomsTask.then((rooms) => {
      if (rooms) publish({ rooms });
    });

    return () => {
      active = false;
      roomsTask.cancel();
    };
  }, [profile]);

  return cues;
}
