export type DialogPoint = { x: number; y: number };
export type DialogBounds = { left: number; top: number; width: number; height: number };

/** Keep the complete panel in view; oversized panels keep their heading reachable. */
export function clampDialogDrag(point: DialogPoint, panel: DialogBounds, viewport: DialogBounds, inset = 12): DialogPoint {
  const minX = viewport.left + inset - panel.left;
  const minY = viewport.top + inset - panel.top;
  const maxX = Math.max(minX, viewport.left + viewport.width - inset - panel.left - panel.width);
  const maxY = Math.max(minY, viewport.top + viewport.height - inset - panel.top - panel.height);
  return { x: Math.min(maxX, Math.max(minX, point.x)), y: Math.min(maxY, Math.max(minY, point.y)) };
}

export const DIALOG_FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function getDialogFocusable(roots: HTMLElement[]): HTMLElement[] {
  return [...new Set(roots.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE))))]
    .filter(node => node.tabIndex >= 0 && !node.closest('[inert],[hidden],[aria-hidden="true"]') && node.getClientRects().length > 0);
}

const locks = new WeakMap<Document, { count: number; overflow: string; paddingRight: string }>();
export function lockDialogScroll(doc: Document): () => void {
  let lock = locks.get(doc);
  if (lock) lock.count += 1;
  else {
    lock = { count: 1, overflow: doc.body.style.overflow, paddingRight: doc.body.style.paddingRight };
    locks.set(doc, lock);
    const gutter = Math.max(0, (doc.defaultView?.innerWidth ?? 0) - doc.documentElement.clientWidth);
    if (gutter) doc.body.style.paddingRight = `${parseFloat(doc.defaultView?.getComputedStyle(doc.body).paddingRight ?? '0') + gutter}px`;
    doc.body.style.overflow = 'hidden';
  }
  return () => {
    const current = locks.get(doc);
    if (!current || --current.count > 0) return;
    doc.body.style.overflow = current.overflow;
    doc.body.style.paddingRight = current.paddingRight;
    locks.delete(doc);
  };
}
