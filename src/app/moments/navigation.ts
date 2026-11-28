import { isPlazaMessageId, PLAZA_PATH } from '../cloud/navigation';

const MAX_RETURN_LENGTH = 2048;
const MAX_RETURN_DEPTH = 4;
const SIMPLE_RETURNS = new Set(['/', '/soul', '/cloud', '/moments', '/doodle', '/profile', '/island']);
const ROOM_RETURN_PATTERN = /^\/soul\/[A-Za-z0-9_-]+$/;
const ISLAND_RETURN_PATTERN = /^\/island\/[A-Za-z0-9_-]+$/;
const USER_ID_PATTERN = /^[A-Za-z0-9]{3,20}$/;
const MOMENT_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const PUBLIC_KEY_PATTERN = /^(?:planetguide|[A-Za-z0-9_-]{18})$/;
const PROFILE_SECTIONS = new Set(['moments', 'messages', 'friends']);

// 星语详情只接受站内来源，避免把返回按钮变成开放重定向。
function isPlazaReturnTo(value: string): boolean {
  if (value === PLAZA_PATH) return true;
  const prefix = `${PLAZA_PATH}&id=`;
  return value.startsWith(prefix) && isPlazaMessageId(value.slice(prefix.length));
}

export function isSimpleAppReturn(value: string): boolean {
  return SIMPLE_RETURNS.has(value)
    || ROOM_RETURN_PATTERN.test(value)
    || ISLAND_RETURN_PATTERN.test(value)
    || isPlazaReturnTo(value);
}

function readSafeUrl(value: string): URL | null {
  if (!value || value.length > MAX_RETURN_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\u0000-\u001f\u007f\\#\s@]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, 'https://neon.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://neon.local' || url.username || url.password || url.hash) return null;
  const rawPath = value.split('?')[0];
  if (rawPath !== url.pathname) return null;
  if (url.pathname.includes('//') || url.pathname.split('/').some((part) => part === '.' || part === '..')) return null;
  return url;
}

function searchKeys(url: URL): string[] | null {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return null;
  if (url.search && keys.length === 0) return null;
  return keys;
}

function profileUserId(pathname: string): string | null {
  if (pathname === '/profile') return '';
  if (!pathname.startsWith('/profile/')) return null;
  const userId = pathname.slice('/profile/'.length);
  return USER_ID_PATTERN.test(userId) ? userId : null;
}

function isSafeProfileFrom(value: string, depth: number): boolean {
  if (depth > MAX_RETURN_DEPTH) return false;
  return isSimpleAppReturn(value) || isSafeMomentDetailReturn(value, depth);
}

function isSafeProfileLocation(value: string, depth: number): boolean {
  if (depth > MAX_RETURN_DEPTH) return false;
  const url = readSafeUrl(value);
  if (!url || profileUserId(url.pathname) === null) return false;
  const keys = searchKeys(url);
  if (!keys || keys.some((key) => key !== 'key' && key !== 'from' && key !== 'section')) return false;
  const publicKey = url.searchParams.get('key');
  if (publicKey !== null && !PUBLIC_KEY_PATTERN.test(publicKey)) return false;
  const section = url.searchParams.get('section');
  if (section !== null && !PROFILE_SECTIONS.has(section)) return false;
  const from = url.searchParams.get('from');
  return from === null || isSafeProfileFrom(from, depth + 1);
}

function isSafeMomentReturnTarget(value: string, depth: number): boolean {
  if (depth > MAX_RETURN_DEPTH) return false;
  return isSimpleAppReturn(value) || isSafeProfileLocation(value, depth);
}

export function isSafeMomentDetailReturn(value: string, depth = 0): boolean {
  if (depth > MAX_RETURN_DEPTH) return false;
  const url = readSafeUrl(value);
  if (!url) return false;
  const id = url.pathname.startsWith('/moments/') ? url.pathname.slice('/moments/'.length) : '';
  if (!MOMENT_ID_PATTERN.test(id) || url.pathname !== `/moments/${id}`) return false;
  const keys = searchKeys(url);
  if (!keys || keys.some((key) => key !== 'from')) return false;
  if (keys.length === 0) return true;
  const from = url.searchParams.get('from');
  if (!from) return false;
  return isSafeMomentReturnTarget(from, depth + 1);
}

export function sanitizeMomentReturnTo(value: string | null | undefined): string {
  const returnTo = String(value ?? '').trim();
  return returnTo && isSafeMomentReturnTarget(returnTo, 0) ? returnTo : '/moments';
}

export function getMomentBackLabel(returnTo: string): string {
  const safe = sanitizeMomentReturnTo(returnTo);
  if (safe === '/moments') return '星河';
  if (safe.startsWith('/profile')) return '个人中心';
  if (ROOM_RETURN_PATTERN.test(safe)) return '聊天';
  if (safe === '/island' || ISLAND_RETURN_PATTERN.test(safe)) return '浮岛';
  if (safe === '/soul') return '星球';
  if (safe === '/cloud') return '云传';
  if (isPlazaReturnTo(safe)) return '广场';
  if (safe === '/doodle') return '画镜';
  return '首页';
}

export function createMomentHref(momentId: string, options: { returnTo?: string } = {}): string {
  const pathname = `/moments/${encodeURIComponent(momentId)}`;
  if (!options.returnTo) return pathname;
  const returnTo = sanitizeMomentReturnTo(options.returnTo);
  if (returnTo === '/moments') return pathname;
  const query = new URLSearchParams();
  query.set('from', returnTo);
  return `${pathname}?${query.toString()}`;
}
