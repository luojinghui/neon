'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type OverlayEntry = { token: object; kind: 'modal' | 'popup'; zIndex: number; node: HTMLElement; anchor: HTMLElement | null; base: number; changed: (level: number) => void };
const stacks = new WeakMap<Document, OverlayEntry[]>();

/** React runs child layout effects first. Sort portal descendants after their owning overlay. */
function orderStack(entries: OverlayEntry[]) {
  const contains = (parent: OverlayEntry, child: OverlayEntry): boolean => !!child.anchor && parent.node.contains(child.anchor);
  const pending = [...entries];
  const ordered: OverlayEntry[] = [];
  while (pending.length) {
    const next = pending.findIndex(child => !pending.some(parent => parent !== child && contains(parent, child)));
    ordered.push(pending.splice(next === -1 ? 0 : next, 1)[0]);
  }
  entries.splice(0, entries.length, ...ordered);
  let level = 980;
  for (const entry of entries) { level = Math.max(entry.base, level + 20); entry.zIndex = level; entry.changed(level); }
}

export function registerOverlay(doc: Document, entry: Omit<OverlayEntry, 'zIndex'>) {
  const entries = stacks.get(doc) ?? [];
  const item = { ...entry, zIndex: entry.base };
  entries.push(item);
  stacks.set(doc, entries);
  orderStack(entries);
  return () => {
    const index = entries.indexOf(item);
    if (index !== -1) entries.splice(index, 1);
  };
}
export function isTopOverlay(doc: Document, token: object, modalOnly = false) {
  const entries = stacks.get(doc)?.filter(entry => !modalOnly || entry.kind === 'modal');
  return !!entries?.length && entries[entries.length - 1].token === token;
}

/** Shared ownership makes Escape dismiss one layer, including portals inside dialogs. */
export function useOverlayStack(open: boolean, node: HTMLElement | null, kind: OverlayEntry['kind'], base: number, anchor: HTMLElement | null = null) {
  const token = useRef({});
  const [zIndex, setZIndex] = useState(base);
  useLayoutEffect(() => {
    if (!open || !node) return;
    const doc = node.ownerDocument;
    return registerOverlay(doc, { token: token.current, kind, base, node, anchor, changed: setZIndex });
  }, [open, node, kind, base, anchor]);
  const isTop = () => !!node && isTopOverlay(node.ownerDocument, token.current);
  const isTopModal = () => !!node && isTopOverlay(node.ownerDocument, token.current, true);
  return { zIndex, isTop, isTopModal };
}
