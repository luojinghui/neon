'use client';

/**
 * 通过 React Portal 事件归属识别嵌套浮层，避免内容操作误关祖先 Popover
 * 不接入外部组件上下文，不阻断调用方事件传播
 *
 * Created at     : 2026-10-20 17:08:35
 * Last modified  : 2026-10-21 15:27:00
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { PopoverLayer, PopoverLayerValue } from '../index.type';

export const PopoverLayerContext = createContext<PopoverLayerValue | null>(null);
/** 仅向同一触发器内的说明传递交互浮层状态，不影响浮层正文中的提示。 */
export const PopoverTriggerContext = createContext(false);

/**
 * 订阅普通触发模式的外部操作，并为 Portal 内容提供捕获事件和嵌套上下文
 * 自定义 closeOnClickOutside 具有独立兼容规则，不通过本 Hook 派发
 */
export function usePopoverLayer(
  open: boolean,
  trigger: HTMLElement | null,
  popup: HTMLElement | null,
  onOutsideMouse?: (event: MouseEvent) => void,
  onOutsideTouch?: (event: TouchEvent) => void,
  captureOutside = false
): PopoverLayer {
  const parent = useContext(PopoverLayerContext);
  const insideEvents = useRef(new WeakSet<Event>());
  const insideNodes = useRef(new Set<HTMLElement>());
  const callbacks = useRef({ onOutsideMouse, onOutsideTouch });

  useLayoutEffect(() => {
    callbacks.current = { onOutsideMouse, onOutsideTouch };
  }, [onOutsideMouse, onOutsideTouch]);

  const markInside = useCallback((event: Event) => {
    insideEvents.current.add(event);
    parent?.markInside(event);
  }, [parent]);

  const registerInside = useCallback((node: HTMLElement) => {
    insideNodes.current.add(node);
    const unregisterParent = parent?.registerInside(node);

    return () => {
      insideNodes.current.delete(node);
      unregisterParent?.();
    };
  }, [parent]);
  const contextValue = useMemo(() => ({ markInside, registerInside }), [markInside, registerInside]);

  useLayoutEffect(() => {
    if (popup && parent) return parent.registerInside(popup);

    return undefined;
  }, [popup, parent]);
  const handleMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    markInside(event.nativeEvent);
  }, [markInside]);
  const handleTouchStartCapture = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    markInside(event.nativeEvent);
  }, [markInside]);

  useEffect(() => {
    if (!open) return;

    const doc = trigger?.ownerDocument ?? popup?.ownerDocument ?? document;
    const isInside = (event: Event) => {
      if (insideEvents.current.has(event)) return true;

      const target = event.target;

      return target instanceof Node && (
        !!trigger?.contains(target) || !!popup?.contains(target)
        || (captureOutside && [...insideNodes.current].some((node) => node.contains(target)))
      );
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!isInside(event)) callbacks.current.onOutsideMouse?.(event);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (!isInside(event)) callbacks.current.onOutsideTouch?.(event);
    };

    doc.addEventListener('mousedown', handleMouseDown, captureOutside);
    doc.addEventListener('touchstart', handleTouchStart, { capture: captureOutside, passive: true });

    return () => {
      doc.removeEventListener('mousedown', handleMouseDown, captureOutside);
      doc.removeEventListener('touchstart', handleTouchStart, captureOutside);
    };
  }, [open, trigger, popup, captureOutside]);

  return {
    contextValue,
    captureProps: {
      onMouseDownCapture: handleMouseDownCapture,
      onTouchStartCapture: handleTouchStartCapture
    }
  };
}
