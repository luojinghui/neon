'use client';

/**
 * 复用 Popover 与 Tooltip 的显隐、Portal、主题及浮层生命周期编排
 * 展示结构由组件决定，默认策略保持 Popover 的公开行为
 *
 * Created at     : 2026-10-21 15:27:00
 * Last modified  : 2026-10-21 15:27:00
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PopupState, UsePopupOptions, XYPopoverProps } from '../index.type';
import { usePopoverTrigger } from './use-trigger';
import { usePopoverPosition } from './use-position';
import { usePopoverPresence } from './use-presence';
import { usePopoverLayer } from './use-layer';
import { usePopoverTheme } from './use-theme';
import { useOverlayStack } from '../../overlay-stack';

/**
 * 管理共享浮层机制；关闭请求与父级更新、内容门控分别处理
 */
export function usePopup(props: XYPopoverProps, options: UsePopupOptions = {}): PopupState {
  const {
    title, content, open, visible, defaultOpen, defaultVisible, onOpenChange, onVisibleChange,
    afterOpenChange, afterVisibleChange, placement = 'top', align, autoAdjustOverflow = true,
    destroyTooltipOnHide = true, transitionName, getPopupContainer
  } = props;
  const {
    enabled = true, resetOpen = false, beforeOpen, outsideMouse = false, captureOutside = false,
    closeOnEscape = false, closeOnScroll = false, descriptionId, trackExpanded = false, positionOptions
  } = options;
  const controlledOpen = open !== undefined ? open : visible;
  const [innerOpen, setInnerOpen] = useState(defaultOpen ?? defaultVisible ?? false);
  const effectiveOpen = enabled && (controlledOpen ?? innerOpen);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const [themeBoundary, setThemeBoundary] = useState<HTMLDivElement | null>(null);
  const [hasOpened, setHasOpened] = useState(effectiveOpen);
  const handleOpenChange = useCallback((next: boolean) => {
    if (next === effectiveOpen) return;
    if (next && !title && !content && title !== 0 && content !== 0) return;
    if (next && beforeOpen && !beforeOpen()) return;

    if (controlledOpen === undefined) setInnerOpen(next);

    onOpenChange?.(next);
    onVisibleChange?.(next);
  }, [effectiveOpen, title, content, beforeOpen, controlledOpen, onOpenChange, onVisibleChange]);
  const trigger = usePopoverTrigger(props, effectiveOpen, handleOpenChange, {
    ...options,
    describedBy: effectiveOpen ? descriptionId : undefined,
    expanded: trackExpanded ? effectiveOpen : undefined
  });
  const position = usePopoverPosition({
    ...positionOptions,
    trigger: trigger.node,
    popup,
    enabled: effectiveOpen,
    placement,
    offset: align?.offset,
    autoAdjustOverflow
  });
  const handleAfterChange = useCallback((next: boolean) => {
    afterOpenChange?.(next);
    afterVisibleChange?.(next);
  }, [afterOpenChange, afterVisibleChange]);
  const presence = usePopoverPresence(effectiveOpen, position.ready, transitionName === '', handleAfterChange);
  const renderPopup = effectiveOpen || presence.present || (!destroyTooltipOnHide && hasOpened);
  const cancelTrigger = trigger.cancel;
  const handleOutside = useCallback(() => {
    cancelTrigger();
    handleOpenChange(false);
  }, [cancelTrigger, handleOpenChange]);
  const layer = usePopoverLayer(
    effectiveOpen,
    trigger.node,
    popup,
    trigger.closeOnMouse || outsideMouse ? handleOutside : undefined,
    handleOutside,
    captureOutside
  );

  usePopoverTheme(trigger.node, themeBoundary, renderPopup);
  const stack = useOverlayStack(effectiveOpen, popup, 'popup', props.zIndex ?? 1030, trigger.node);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useLayoutEffect(() => {
    if (!trigger.node || !renderPopup) return;

    setContainer(getPopupContainer?.(trigger.node) || trigger.node.ownerDocument.body);
  }, [trigger.node, renderPopup, getPopupContainer]);

  useLayoutEffect(() => {
    if (effectiveOpen) setHasOpened(true);
  }, [effectiveOpen]);

  useEffect(() => {
    if (resetOpen && controlledOpen === undefined) setInnerOpen(false);
  }, [resetOpen, controlledOpen]);

  useEffect(() => {
    if (!effectiveOpen || (!closeOnEscape && !closeOnScroll)) return;

    const doc = trigger.node?.ownerDocument || document;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && stackRef.current.isTop()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleOutside();
      }
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && popup?.contains(event.target)) return;

      handleOutside();
    };

    if (closeOnEscape) doc.addEventListener('keydown', handleKeyDown);

    if (closeOnScroll) {
      doc.addEventListener('scroll', handleScroll, true);
      doc.defaultView?.visualViewport?.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (closeOnEscape) doc.removeEventListener('keydown', handleKeyDown);

      if (closeOnScroll) {
        doc.removeEventListener('scroll', handleScroll, true);
        doc.defaultView?.visualViewport?.removeEventListener('scroll', handleScroll);
      }
    };
  }, [effectiveOpen, closeOnEscape, closeOnScroll, trigger.node, popup, handleOutside]);

  return { trigger, position, presence, layer, container, popup, setPopup, setThemeBoundary, renderPopup, effectiveOpen, overlayLevel: stack.zIndex };
}
