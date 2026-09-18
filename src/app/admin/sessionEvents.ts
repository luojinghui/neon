'use client';

const ADMIN_SESSION_CHANGE_KEY = 'neon:admin-session-change';
const ADMIN_SESSION_CHANGE_EVENT = 'neon:admin-session-change';

export function notifyAdminSessionChanged(): void {
  if (typeof window === 'undefined') return;
  // Only announce that the HttpOnly cookie changed; credentials stay in the cookie.
  try {
    window.localStorage.setItem(ADMIN_SESSION_CHANGE_KEY, `${Date.now()}:${Math.random()}`);
  } catch {
    // Same-page listeners still work when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(ADMIN_SESSION_CHANGE_EVENT));
}

export function subscribeAdminSessionChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_SESSION_CHANGE_KEY) listener();
  };
  window.addEventListener(ADMIN_SESSION_CHANGE_EVENT, listener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(ADMIN_SESSION_CHANGE_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}
