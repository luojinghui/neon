'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Button, buttonClassName } from './button';
import { createTabClickGuard, nearestTab, tabDragDirection, tabDragScrollStep } from './tabs-gesture';
import styles from './tabs.module.css';

export interface TabItem {
  key: string;
  label: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  /** Supply href on every item for real link navigation, including modified clicks. */
  href?: string;
}
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  items: TabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  block?: boolean;
  /** Shared external tabpanel, for pages which preserve their existing content lifecycle. */
  panelId?: string;
  /** Intercept ordinary link navigation, e.g. when URL state uses history.pushState. */
  onNavigate?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}
type TabElement = HTMLButtonElement | HTMLAnchorElement;
type Drag = { pointerId: number; startX: number; startY: number; clientX: number; original?: string; preview: string; active: boolean };
/** Light tick on supporting devices (Android / app webviews) whenever the drag crosses into another tab. */
const tick = () => { try { navigator.vibrate?.(6); } catch {} };

/** Glass items sit in an opaque track. A drag previews selection and commits only on release. */
export function Tabs({ items, activeKey, defaultActiveKey, onChange, size = 'md', disabled = false,
  block = false, panelId, onNavigate, className, id, 'aria-label': label = '选项卡', 'aria-labelledby': labelledBy, ...props }: TabsProps) {
  const generatedId = useId();
  const baseId = id ?? `tabs-${generatedId}`;
  const [localKey, setLocalKey] = useState(defaultActiveKey ?? items.find(item => !item.disabled)?.key);
  const controlled = activeKey !== undefined;
  const requestedKey = controlled ? activeKey : localKey;
  const selectedKey = items.find(item => item.key === requestedKey && !item.disabled)?.key ?? items.find(item => !item.disabled)?.key;
  const navigation = items.length > 0 && items.every(item => !!item.href);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const elements = useRef(new Map<string, TabElement>());
  const drag = useRef<Drag | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const clickGuard = useRef(createTabClickGuard());
  const currentKey = useRef(selectedKey);
  currentKey.current = selectedKey;
  const enabledKeys = () => disabled ? [] : items.filter(item => !item.disabled).map(item => item.key);

  const draw = useCallback((key: string | undefined, left?: number) => {
    const container = track.current, thumb = indicator.current, element = key ? elements.current.get(key) : undefined;
    if (!container || !thumb) return;
    if (!element || !container.clientWidth) { delete container.dataset.indicator; return; }
    const bounds = container.getBoundingClientRect(), rect = element.getBoundingClientRect();
    thumb.style.width = `${rect.width}px`;
    thumb.style.transform = `translateX(${left ?? rect.left - bounds.left}px)`;
    container.dataset.indicator = '';
  }, []);

  const choose = (key: string, focus = false) => {
    if (!enabledKeys().includes(key)) return;
    if (!controlled) setLocalKey(key);
    if (key !== currentKey.current) onChange?.(key);
    draw(controlled ? currentKey.current : key);
    if (focus) {
      const element = elements.current.get(key);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const finish = (commit: boolean) => {
    const state = drag.current, container = track.current;
    if (!state || !container) return;
    drag.current = null;
    if (scrollFrame.current !== null) { cancelAnimationFrame(scrollFrame.current); scrollFrame.current = null; }
    delete container.dataset.dragging; delete container.dataset.pressed;
    elements.current.forEach(element => delete element.dataset.preview);
    if (state.active) {
      clickGuard.current.afterDrag();
      if (commit && enabledKeys().includes(state.preview)) {
        const element = elements.current.get(state.preview);
        if (navigation && element instanceof HTMLAnchorElement) element.click();
        else choose(state.preview, true);
      } else draw(currentKey.current);
    } else draw(currentKey.current);
    if (container.hasPointerCapture(state.pointerId)) container.releasePointerCapture(state.pointerId);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useLayoutEffect(() => { finishRef.current(false); draw(selectedKey); }, [selectedKey, items, size, disabled, draw]);
  useEffect(() => {
    const container = track.current;
    if (!container) return;
    const observer = new ResizeObserver(() => { finishRef.current(false); draw(currentKey.current); });
    observer.observe(container);
    elements.current.forEach(element => observer.observe(element));
    const cancel = () => finishRef.current(false);
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect(); window.removeEventListener('blur', cancel);
      if (scrollFrame.current !== null) { cancelAnimationFrame(scrollFrame.current); scrollFrame.current = null; }
    };
  }, [items, draw]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest<HTMLElement>('[data-tab-key]');
    const key = element?.dataset.tabKey;
    if (event.button !== 0 || !event.isPrimary || !key || !enabledKeys().includes(key)) return;
    clickGuard.current.pointerDown();
    if (track.current) track.current.dataset.pressed = '';
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, clientX: event.clientX, original: currentKey.current, preview: key, active: false };
  };
  const previewAt = (clientX: number) => {
    const state = drag.current, container = track.current;
    if (!state || !container) return;
    const candidates = enabledKeys().flatMap(key => {
      const element = elements.current.get(key);
      return element ? [{ key, rect: element.getBoundingClientRect() }] : [];
    });
    if (!candidates.length) { finish(false); return; }
    const nearest = nearestTab(candidates.map(item => ({ ...item, left: item.rect.left, width: item.rect.width })), clientX)!;
    if (state.preview !== nearest.key) tick();
    state.preview = nearest.key;
    elements.current.forEach((element, key) => element.toggleAttribute('data-preview', key === nearest.key));
    const bounds = container.getBoundingClientRect();
    const min = Math.min(...candidates.map(item => item.rect.left)) - bounds.left;
    const max = Math.max(...candidates.map(item => item.rect.right)) - bounds.left - nearest.rect.width;
    draw(nearest.key, Math.max(min, Math.min(max, clientX - bounds.left - nearest.rect.width / 2)));
  };
  const previewRef = useRef(previewAt);
  previewRef.current = previewAt;
  const scrollDrag = () => {
    const state = drag.current, scroller = viewport.current;
    if (!state?.active || !scroller) { scrollFrame.current = null; return; }
    const bounds = scroller.getBoundingClientRect();
    const step = tabDragScrollStep(state.clientX, bounds.left, bounds.width);
    if (step) {
      const before = scroller.scrollLeft;
      scroller.scrollLeft += step;
      if (scroller.scrollLeft !== before) previewRef.current(state.clientX);
    }
    scrollFrame.current = requestAnimationFrame(scrollDrag);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current, container = track.current;
    if (!state || !container || state.pointerId !== event.pointerId) return;
    state.clientX = event.clientX;
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
    if (!state.active) {
      const direction = tabDragDirection(dx, dy);
      if (direction === 'vertical') { finish(false); return; }
      if (direction === 'pending') return;
      state.active = true;
      container.dataset.dragging = '';
      container.setPointerCapture(event.pointerId);
      if (viewport.current && viewport.current.scrollWidth > viewport.current.clientWidth)
        scrollFrame.current = requestAnimationFrame(scrollDrag);
    }
    event.preventDefault();
    previewAt(event.clientX);
  };

  return <div {...props} id={id} className={cn(styles.root, block && styles.block, className)} data-ui-tabs="">
    <div ref={viewport} className={styles.viewport}>
      <div ref={track} className={cn(styles.track, styles[size])} role={navigation ? 'navigation' : 'tablist'}
        aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} aria-orientation={navigation ? undefined : 'horizontal'}
        onPointerDown={startDrag} onPointerMove={moveDrag} onDragStart={event => event.preventDefault()}
        onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) finish(true); }}
        onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) finish(false); }}
        onLostPointerCapture={event => { if (event.target === track.current && drag.current?.pointerId === event.pointerId) finish(false); }}
        onPointerLeave={() => { if (drag.current && !drag.current.active) finish(false); }}
        onClickCapture={event => { if (clickGuard.current.suppress(event.detail)) { event.preventDefault(); event.stopPropagation(); } }}
        onKeyDown={event => {
          if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const keys = enabledKeys(), element = (event.target as Element).closest<HTMLElement>('[data-tab-key]');
          if (!keys.length || !element?.dataset.tabKey) return;
          event.preventDefault(); finish(false);
          const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
          const step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
          const index = keys.indexOf(element.dataset.tabKey);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + step + keys.length) % keys.length;
          if (navigation) elements.current.get(keys[next])?.focus();
          else choose(keys[next], true);
        }}>
        <span ref={indicator} className={styles.indicator} aria-hidden="true" />
        {items.map((item, index) => {
          const active = item.key === selectedKey, unavailable = disabled || item.disabled;
          const common = {
            id: `${baseId}-tab-${encodeURIComponent(item.key)}`, 'data-tab-key': item.key, 'data-active': active ? '' : undefined,
            'data-ui-surface': '', className: styles.tab,
            ref: (element: TabElement | null) => { if (element) elements.current.set(item.key, element); else elements.current.delete(item.key); }
          };
          const content = <span className={styles.label}>{item.label}</span>;
          if (navigation) return <a {...common} key={item.key} data-ui-button="" draggable={false} onDragStart={event => event.preventDefault()} href={unavailable ? undefined : item.href}
            className={buttonClassName({ variant: 'ghost', size, className: styles.tab })} aria-current={active ? 'page' : undefined}
            aria-disabled={unavailable || undefined} tabIndex={unavailable ? -1 : undefined}
            onClick={event => {
              if (unavailable) { event.preventDefault(); return; }
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              choose(item.key); onNavigate?.(item.href!, event);
            }}>{content}</a>;
          return <Button {...common} key={item.key} variant="ghost" size={size} role="tab" aria-selected={active}
            aria-controls={item.children !== undefined ? `${baseId}-panel-${index}` : panelId} disabled={unavailable}
            tabIndex={active && !unavailable ? 0 : -1} onClick={() => choose(item.key)}>{content}</Button>;
        })}
      </div>
    </div>
    {!navigation && items.map((item, index) => item.children !== undefined && <div key={item.key} id={`${baseId}-panel-${index}`}
      role="tabpanel" aria-labelledby={`${baseId}-tab-${encodeURIComponent(item.key)}`} className={styles.panel} hidden={item.key !== selectedKey}>{item.children}</div>)}
  </div>;
}
