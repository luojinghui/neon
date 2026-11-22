export type IslandItemType = 'note' | 'polaroid' | 'sticker' | 'tape';

export type NoteColorKey = 'sun' | 'sky' | 'blush' | 'mint' | 'lavender';

export interface NoteItemData {
  text: string;
  color: NoteColorKey;
}

export interface PolaroidItemData {
  imageUrl: string;
  caption: string;
  dateLabel: string;
}

export interface StickerItemData {
  presetId: string;
}

export interface TapeItemData {
  presetId: string;
}

export type IslandItemData = NoteItemData | PolaroidItemData | StickerItemData | TapeItemData;

export interface IslandItem {
  id: string;
  type: IslandItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  authorPublicKey: string;
  authorName: string;
  data: IslandItemData;
  createdAt: string;
  updatedAt: string;
}

export interface IslandPerson {
  publicKey: string;
  userId: string;
  name: string;
  avatarUrl: string;
}

export interface IslandMember extends IslandPerson {
  joinedAt: string;
  lastVisitedAt: string;
}

export interface IslandSummary {
  id: string;
  name: string;
  owner: IslandPerson;
  isOwner: boolean;
  memberCount: number;
  itemCount: number;
  onlineCount: number;
  updatedAt: string;
  createdAt: string;
  /** Only present on ownIsland (or admin responses). */
  inviteToken?: string;
  inviteExpiresAt?: string;
  inviteExpired?: boolean;
  members?: IslandMember[];
}

export interface IslandSkyResponse {
  ownIsland: IslandSummary;
  joinedIslands: IslandSummary[];
}

export interface IslandDetail extends IslandSummary {
  items: IslandItem[];
  members: IslandMember[];
  canEdit: boolean;
  isAdmin?: boolean;
}

export interface IslandInvitePreview {
  inviteToken: string;
  islandId?: string;
  islandName: string;
  owner: IslandPerson;
  expired: boolean;
  inviteExpiresAt: string;
  alreadyJoined: boolean;
  isOwner: boolean;
}

export interface ProfileIslandStatus {
  accessible: boolean;
  isOwner: boolean;
  island?: IslandSummary;
}

export const ISLAND_MEMBER_PALETTE = [
  '#FF6B6B',
  '#FF922B',
  '#51CF66',
  '#22B8CF',
  '#5C7CFA',
  '#CC5DE8',
  '#F06595',
  '#20C997',
  '#FAB005',
  '#845EF7',
  '#339AF0',
  '#FF8787'
] as const;

export function pickIslandMemberColor(publicKey: string): string {
  const text = String(publicKey || '');
  if (!text) return 'hsl(var(--primary))';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return ISLAND_MEMBER_PALETTE[hash % ISLAND_MEMBER_PALETTE.length];
}

export interface IslandOnlineUser {
  socketId: string;
  publicKey: string;
  userId: string;
  name: string;
  avatarUrl: string;
  color: string;
  cursor: { x: number; y: number } | null;
  lockedItemId: string | null;
  focusedItemId?: string | null;
  viewportCenter?: { x: number; y: number } | null;
}

export interface AdminIslandSummary extends IslandSummary {
  inviteToken: string;
  inviteExpiresAt: string;
  inviteExpired: boolean;
  members: IslandMember[];
}

export interface AdminIslandDetail extends AdminIslandSummary {
  items: IslandItem[];
}
