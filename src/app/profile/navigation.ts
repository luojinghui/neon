import { isPlazaMessageId, PLAZA_PATH } from '../cloud/navigation';
import { isSafeMomentDetailReturn, isSimpleAppReturn } from '../moments/navigation';

const ROOM_RETURN_PATTERN = /^\/soul\/[A-Za-z0-9_-]+$/;
const ISLAND_RETURN_PATTERN = /^\/island\/[A-Za-z0-9_-]+$/;
const PROFILE_SECTIONS = ['moments', 'messages', 'friends'] as const;

type ProfileSection = (typeof PROFILE_SECTIONS)[number];

function isPlazaReturnTo(value: string): boolean {
  if (value === PLAZA_PATH) return true;
  const prefix = `${PLAZA_PATH}&id=`;
  return value.startsWith(prefix) && isPlazaMessageId(value.slice(prefix.length));
}

export function sanitizeProfileReturnTo(value: string | null | undefined): string {
  const returnTo = String(value || '').trim();
  if (isSimpleAppReturn(returnTo) || isSafeMomentDetailReturn(returnTo)) return returnTo;
  return '/';
}

export function sanitizeProfileSection(value: string | null | undefined): ProfileSection | '' {
  const section = String(value || '');
  return PROFILE_SECTIONS.includes(section as ProfileSection) ? section as ProfileSection : '';
}

export function resolveProfileSection(value: string | null | undefined, isOwner: boolean): 'profile' | ProfileSection {
  const section = sanitizeProfileSection(value);
  if (section === 'moments') return 'moments';
  if (isOwner && (section === 'messages' || section === 'friends')) return section;
  return 'profile';
}

export function getProfileBackLabel(returnTo: string): string {
  if (isSafeMomentDetailReturn(returnTo)) return '星语';
  if (ROOM_RETURN_PATTERN.test(returnTo)) return '聊天';
  if (returnTo === '/island' || ISLAND_RETURN_PATTERN.test(returnTo)) return '浮岛';
  if (returnTo === '/soul') return '星球';
  if (returnTo === '/cloud') return '云传';
  if (isPlazaReturnTo(returnTo)) return '广场';
  if (returnTo === '/moments') return '星河';
  if (returnTo === '/doodle') return '画镜';
  if (returnTo === '/profile') return '个人中心';
  return '首页';
}

export function createProfileHref(userId: string, options: { publicKey?: string; returnTo?: string; section?: string } = {}): string {
  const pathname = userId ? `/profile/${encodeURIComponent(userId)}` : '/profile';
  const query = new URLSearchParams();
  if (options.publicKey) query.set('key', options.publicKey);
  if (options.returnTo) query.set('from', sanitizeProfileReturnTo(options.returnTo));
  const section = sanitizeProfileSection(options.section);
  if (section) query.set('section', section);
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
