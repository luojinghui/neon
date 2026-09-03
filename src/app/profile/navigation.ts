const ROOM_RETURN_PATTERN = /^\/soul\/[A-Za-z0-9_-]+$/;

export function sanitizeProfileReturnTo(value: string | null | undefined): string {
  const returnTo = String(value || '').trim();
  if (returnTo === '/' || returnTo === '/soul' || returnTo === '/cloud' || ROOM_RETURN_PATTERN.test(returnTo)) return returnTo;
  return '/';
}

export function getProfileBackLabel(returnTo: string): string {
  if (ROOM_RETURN_PATTERN.test(returnTo)) return '聊天';
  if (returnTo === '/soul') return '星球';
  if (returnTo === '/cloud') return '云传';
  return '首页';
}

export function createProfileHref(userId: string, options: { publicKey?: string; returnTo?: string } = {}): string {
  const pathname = userId ? `/profile/${encodeURIComponent(userId)}` : '/profile';
  const query = new URLSearchParams();
  if (options.publicKey) query.set('key', options.publicKey);
  if (options.returnTo) query.set('from', sanitizeProfileReturnTo(options.returnTo));
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
