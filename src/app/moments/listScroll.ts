const MOMENT_LIST_SCROLL_KEY = 'neon:moments-list-scroll';

type ScrollStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): ScrollStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeMomentListScroll(scrollTop: number, storage: ScrollStorage | null = browserStorage()): void {
  if (!storage || !Number.isFinite(scrollTop) || scrollTop < 0) return;
  try {
    storage.setItem(MOMENT_LIST_SCROLL_KEY, String(Math.round(scrollTop)));
  } catch {
    // 浏览器禁止写入时，返回后从列表顶部开始。
  }
}

export function readMomentListScroll(storage: ScrollStorage | null = browserStorage()): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(MOMENT_LIST_SCROLL_KEY);
    if (raw == null || !/^\d+$/.test(raw)) return null;
    return Number(raw);
  } catch {
    return null;
  }
}

export function clearMomentListScroll(storage: ScrollStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(MOMENT_LIST_SCROLL_KEY);
  } catch {
    // 清不掉时，下一次返回仍会尝试回到原位置。
  }
}

export function rememberMomentListScroll(node: EventTarget | null): void {
  if (typeof Element === 'undefined' || !(node instanceof Element)) return;
  const scroller = node.closest('[data-moment-list]');
  if (!(scroller instanceof HTMLElement)) return;
  writeMomentListScroll(scroller.scrollTop);
}
