const MOMENT_LIST_PLACE_KEY = 'neon:moments-list-place';
const MOMENT_ID = /^[A-Za-z0-9_-]{16}$/;

type ScrollStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type MomentListPlace = {
  id: string;
  /** 卡片顶部距离列表可视区域顶部的像素。 */
  offset: number;
  /** 卡片还没画出来时使用的滚动条位置。 */
  top: number;
};

function browserStorage(): ScrollStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function roundFinite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

export function alignMomentListScroll(scrollTop: number, cardOffset: number, savedOffset: number): number {
  if (![scrollTop, cardOffset, savedOffset].every(Number.isFinite)) return Math.max(0, scrollTop || 0);
  return Math.max(0, Math.round(scrollTop + cardOffset - savedOffset));
}

export function momentListPlaceSettled(cardOffset: number, savedOffset: number, tolerance = 2): boolean {
  return Number.isFinite(cardOffset) && Number.isFinite(savedOffset) && Math.abs(cardOffset - savedOffset) <= tolerance;
}

export function writeMomentListPlace(place: MomentListPlace, storage: ScrollStorage | null = browserStorage()): void {
  const offset = roundFinite(place.offset);
  const top = roundFinite(place.top);
  if (!storage || !MOMENT_ID.test(place.id) || offset == null || top == null || top < 0) return;
  try {
    storage.setItem(MOMENT_LIST_PLACE_KEY, JSON.stringify({ id: place.id, offset, top }));
  } catch {
    // 浏览器禁止写入时，返回后从列表顶部开始。
  }
}

export function readMomentListPlace(storage: ScrollStorage | null = browserStorage()): MomentListPlace | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(MOMENT_LIST_PLACE_KEY) || 'null') as Partial<MomentListPlace> | null;
    const id = String(parsed?.id || '');
    const offset = roundFinite(parsed?.offset);
    const top = roundFinite(parsed?.top);
    if (!MOMENT_ID.test(id) || offset == null || top == null || top < 0) return null;
    return { id, offset, top };
  } catch {
    return null;
  }
}

export function clearMomentListPlace(storage: ScrollStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(MOMENT_LIST_PLACE_KEY);
  } catch {
    // 清不掉时，下一次返回仍会按这张卡片对齐。
  }
}

export function rememberMomentListScroll(node: EventTarget | null): void {
  if (typeof Element === 'undefined' || !(node instanceof Element)) return;
  const scroller = node.closest('[data-moment-list]');
  const card = node.closest('[id^="moment-"]');
  if (!(scroller instanceof HTMLElement) || !(card instanceof HTMLElement) || !scroller.contains(card)) return;
  const id = card.id.slice('moment-'.length);
  const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  writeMomentListPlace({ id, offset, top: scroller.scrollTop });
}
