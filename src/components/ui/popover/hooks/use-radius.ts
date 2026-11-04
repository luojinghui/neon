'use client';

import { useLayoutEffect, useState, type CSSProperties } from 'react';
import type { OverlayRadius } from '../index.type';

const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const;
export function readTriggerRadii(trigger: HTMLElement): CSSProperties {
  const source = trigger.hasAttribute('data-ui-trigger-wrapper') ? trigger.firstElementChild ?? trigger : trigger;
  const computed = trigger.ownerDocument.defaultView!.getComputedStyle(source);
  return Object.fromEntries(corners.map(corner => [corner, computed[corner]]));
}
/** Preserve each computed corner, including elliptical and capsule geometry. */
export function resolveOverlayRadius(radius: OverlayRadius, inherited: CSSProperties, fallback: 'sm' | 'lg'): CSSProperties {
  if (radius !== 'auto' && radius !== 'inherit') return { borderRadius: radius === 0 ? 0 : `var(--radius-${radius})` };
  const rounded = corners.some(corner => String(inherited[corner] ?? '').split(/\s+/).some(value => parseFloat(value) > 0));
  return radius === 'inherit' || rounded ? inherited : { borderRadius: `var(--radius-${fallback})` };
}
export function useOverlayRadius(trigger: HTMLElement | null, radius: OverlayRadius = 'auto', fallback: 'sm' | 'lg' = 'lg'): CSSProperties {
  const [inherited, setInherited] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!trigger) return;
    const win = trigger.ownerDocument.defaultView!;
    const update = () => {
      const next = readTriggerRadii(trigger);
      setInherited(current => corners.every(corner => current[corner] === next[corner]) ? current : next);
    };
    update();
    const mutations = new win.MutationObserver(update);
    for (let ancestor: Element | null = trigger; ancestor; ancestor = ancestor.parentElement) {
      mutations.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'data-skin'] });
    }
    if (trigger.hasAttribute('data-ui-trigger-wrapper')) mutations.observe(trigger, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    const observer = new win.ResizeObserver(update);
    observer.observe(trigger);
    win.addEventListener('resize', update);
    return () => { mutations.disconnect(); observer.disconnect(); win.removeEventListener('resize', update); };
  }, [trigger]);
  return resolveOverlayRadius(radius, inherited, fallback);
}

/** A disabled/custom trigger's wrapper follows its child, including its focus-ring geometry. */
export function useTriggerWrapperRadius(trigger: HTMLElement | null, wrapper: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!trigger || !wrapper) return;
    const win = trigger.ownerDocument.defaultView!;
    const sync = () => {
      const values = readTriggerRadii(trigger);
      for (const corner of corners) {
        const value = String(values[corner] ?? '');
        if (wrapper.style[corner] !== value) wrapper.style[corner] = value;
      }
    };
    sync();
    const observer = new win.MutationObserver(sync);
    observer.observe(wrapper, { subtree: true, attributes: true, attributeFilter: ['class', 'style'], childList: true });
    for (let ancestor = wrapper.parentElement; ancestor; ancestor = ancestor.parentElement) observer.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'data-skin'] });
    win.addEventListener('resize', sync);
    return () => { observer.disconnect(); win.removeEventListener('resize', sync); };
  }, [trigger, wrapper]);
}
