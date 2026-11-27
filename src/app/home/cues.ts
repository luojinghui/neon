export type HomeNodeId = 'soul' | 'moments' | 'cloud' | 'island' | 'doodle';

export interface HomeCue {
  /** 卡片上没有的事实；没有新鲜数据时留空，只保留可点击的去向。 */
  detail: string;
  action: string;
  href: string;
}

export interface RoomHint {
  id: string;
  name: string;
  kind?: string;
  onlineCount?: number;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
}

export interface MomentHint {
  createdAt: string;
  text?: string;
}

export interface CloudHint {
  text: string;
  timestamp: number;
}

export interface IslandHint {
  id: string;
  name: string;
  itemCount?: number;
  onlineCount?: number;
}

export interface DoodleHint {
  id: string;
  title: string;
  createdAt: string;
  state?: string;
}

export interface HomeSignals {
  now?: Date;
  rooms?: RoomHint[];
  moments?: MomentHint[];
  momentsHaveMore?: boolean;
  cloud?: CloudHint | null;
  island?: IslandHint | null;
  doodle?: DoodleHint | null;
}

export const FALLBACK_CUES: Record<HomeNodeId, HomeCue> = {
  soul: { detail: '', action: '去星球看看谁在', href: '/soul' },
  moments: { detail: '', action: '留下一句星语', href: '/moments' },
  cloud: { detail: '', action: '去云传放一句，或丢个文件', href: '/cloud' },
  island: { detail: '', action: '去浮岛贴一张', href: '/island' },
  doodle: { detail: '', action: '去画镜画一张', href: '/doodle' }
};

function clip(text: string, max = 12): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function sameLocalDay(value: string | number | Date, now: Date): boolean {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function roomTime(room: RoomHint): number {
  const stamp = Date.parse(room.lastMessageAt || room.updatedAt || '');
  return Number.isFinite(stamp) ? stamp : 0;
}

function pickRoom(rooms: RoomHint[]): RoomHint | null {
  const named = rooms.filter((room) => room.id && room.name.trim() && room.kind !== 'direct');
  if (!named.length) return null;
  const online = named.filter((room) => (room.onlineCount || 0) > 0);
  const pool = online.length ? online : named.filter((room) => roomTime(room) > 0);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const onlineGap = (b.onlineCount || 0) - (a.onlineCount || 0);
    if (online.length && onlineGap !== 0) return onlineGap;
    return roomTime(b) - roomTime(a);
  })[0];
}

function soulCue(rooms: RoomHint[] | undefined): HomeCue {
  const room = pickRoom(rooms || []);
  if (!room) return FALLBACK_CUES.soul;
  const name = clip(room.name, 10);
  const href = `/soul/${encodeURIComponent(room.id)}`;
  const online = room.onlineCount || 0;
  if (online > 0) {
    return { detail: `${online} 个人正在「${name}」`, action: '去看看', href };
  }
  return { detail: `最近在「${name}」聊过`, action: '回到那里', href };
}

function momentsCue(moments: MomentHint[] | undefined, hasMore: boolean, now: Date): HomeCue {
  const items = moments || [];
  const today = items.filter((item) => sameLocalDay(item.createdAt, now));
  if (!today.length) return FALLBACK_CUES.moments;
  const snippet = clip(today[0].text || '', 12);
  const stillToday = hasMore && items.length > 0 && sameLocalDay(items[items.length - 1].createdAt, now);
  if (stillToday || today.length === 1) {
    return {
      detail: snippet ? `今天的新星：「${snippet}」` : '今天有一颗新星',
      action: '去星河看看',
      href: '/moments'
    };
  }
  return { detail: `今天新亮了 ${today.length} 颗星`, action: '去星河看看', href: '/moments' };
}

function cloudCue(cloud: CloudHint | null | undefined, now: Date): HomeCue {
  if (!cloud?.text || !sameLocalDay(cloud.timestamp, now)) return FALLBACK_CUES.cloud;
  const snippet = clip(cloud.text, 12);
  if (!snippet) return FALLBACK_CUES.cloud;
  return { detail: `今天传过「${snippet}」`, action: '再补一点', href: '/cloud' };
}

function islandCue(island: IslandHint | null | undefined): HomeCue {
  if (!island?.id || !island.name.trim()) return FALLBACK_CUES.island;
  const name = clip(island.name, 10);
  const href = `/island/${encodeURIComponent(island.id)}`;
  const online = island.onlineCount || 0;
  if (online > 0) return { detail: `${online} 个人在「${name}」`, action: '回到浮岛', href };
  const items = island.itemCount || 0;
  if (items > 0) return { detail: `「${name}」上有 ${items} 张拼贴`, action: '回到浮岛', href };
  return FALLBACK_CUES.island;
}

function doodleCue(doodle: DoodleHint | null | undefined, now: Date): HomeCue {
  if (!doodle?.id || doodle.state === 'expired' || doodle.state === 'deleted') return FALLBACK_CUES.doodle;
  const title = clip(doodle.title || '一张漫画', 10);
  const when = sameLocalDay(doodle.createdAt, now) ? '今天' : '最近';
  return { detail: `${when}画过「${title}」`, action: '再画一张', href: '/doodle' };
}

export function buildHomeCues(signals: HomeSignals = {}): Record<HomeNodeId, HomeCue> {
  const now = signals.now || new Date();
  return {
    soul: soulCue(signals.rooms),
    moments: momentsCue(signals.moments, signals.momentsHaveMore === true, now),
    cloud: cloudCue(signals.cloud, now),
    island: islandCue(signals.island),
    doodle: doodleCue(signals.doodle, now)
  };
}
