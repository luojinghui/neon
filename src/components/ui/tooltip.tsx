'use client';

import { useSyncExternalStore } from 'react';
import { XYTooltip } from './tooltip/index';
import type { XYTooltipProps } from './tooltip/index.type';

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

function subscribeInputMode(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(TOUCH_QUERY);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function isTouchInput() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(TOUCH_QUERY).matches;
}

/** Use touch defaults when hover is unavailable; an explicit isMobile always wins. */
export function Tooltip(props: XYTooltipProps) {
  const touchInput = useSyncExternalStore(subscribeInputMode, isTouchInput, () => false);
  return <XYTooltip {...props} isMobile={props.isMobile ?? touchInput} />;
}

export type {
  XYTooltipProps as TooltipProps,
  XYTooltipPlacement as TooltipPlacement,
  XYTooltipTrigger as TooltipTrigger
} from './tooltip/index.type';
