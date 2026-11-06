'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { SKIN_STORAGE_KEY } from './skin-boot';

/** Skin names mirror the [data-skin] blocks in styles/index.css. */
export const SKINS = [
  { name: 'orange', label: '暖橘' },
  { name: 'blue', label: '晴蓝' },
  { name: 'violet', label: '鸢紫' },
  { name: 'green', label: '松青' },
  { name: 'rose', label: '蔷薇' }
] as const;
export type SkinName = (typeof SKINS)[number]['name'];
const listeners = new Set<() => void>();
const isSkin = (value: string | null): value is SkinName => SKINS.some(skin => skin.name === value);

const read = (): SkinName => {
  try { const value = localStorage.getItem(SKIN_STORAGE_KEY); return isSkin(value) ? value : 'orange'; } catch { return 'orange'; }
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === SKIN_STORAGE_KEY) { apply(read()); listener(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
};
function apply(skin: SkinName) { document.documentElement.dataset.skin = skin; }

export function useSkin() {
  const skin = useSyncExternalStore(subscribe, read, () => 'orange' as SkinName);
  useEffect(() => { apply(skin); }, [skin]);
  const setSkin = useCallback((next: SkinName) => {
    try { localStorage.setItem(SKIN_STORAGE_KEY, next); } catch {}
    apply(next);
    listeners.forEach(listener => listener());
  }, []);
  return [skin, setSkin] as const;
}
