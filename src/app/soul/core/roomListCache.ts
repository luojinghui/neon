import type { ChatRoom } from './types';

const PREFIX = 'neon:planet-list:v1:';
export const ROOM_LIST_MAX_AGE = 6 * 60 * 60 * 1000;

export function readRoomListCache(owner: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>): ChatRoom[] | null {
  try {
    storage ||= localStorage;
    const value = JSON.parse(storage.getItem(PREFIX + owner) || 'null');
    if (!value) return null;
    if (value.owner !== owner || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > ROOM_LIST_MAX_AGE || value.savedAt > Date.now() + 60_000 || !Array.isArray(value.rooms)) throw new Error('Invalid cache');
    if (!value.rooms.every((room: ChatRoom) => room && typeof room.id === 'string' && typeof room.name === 'string' && typeof room.description === 'string' && typeof room.isPrivate === 'boolean' && Array.isArray(room.tags) && room.tags.every(tag => typeof tag === 'string') && room.owner && typeof room.membership === 'string')) throw new Error('Invalid rooms');
    return value.rooms;
  } catch {
    try { storage?.removeItem(PREFIX + owner); } catch { /* Storage can be disabled. */ }
    return null;
  }
}

export function writeRoomListCache(owner: string, rooms: ChatRoom[], storage?: Pick<Storage, 'setItem'>) {
  try { (storage || localStorage).setItem(PREFIX + owner, JSON.stringify({ owner, savedAt: Date.now(), rooms: rooms.slice(0, 200) })); } catch { /* In-memory caching still works. */ }
}
