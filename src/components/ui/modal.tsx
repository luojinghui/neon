'use client';

import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type HTMLAttributes, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icon';
import { Button, type ButtonProps } from './button';
import { PopoverLayerContext } from './popover/hooks/use-layer';
import { usePopoverTheme } from './popover/hooks/use-theme';
import { usePopoverPresence } from './popover/hooks/use-presence';
import { useOverlayStack } from './overlay-stack';
import { clampDialogDrag, getDialogFocusable, lockDialogScroll, type DialogPoint } from './dialog-utils';
import styles from './dialog.module.css';

type DialogSlot = 'root' | 'mask' | 'wrapper' | 'container' | 'header' | 'title' | 'body' | 'footer';
type DialogActionProps = Omit<ButtonProps, 'onClick'> & { danger?: boolean };
export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onCancel' | 'onOk' | 'content'> {
  open?: boolean;
  title?: ReactNode;
  onCancel?: (event: MouseEvent<HTMLElement> | KeyboardEvent) => void;
  onOk?: (event: MouseEvent<HTMLElement>) => unknown | Promise<unknown>;
  footer?: ReactNode | ((origin: ReactNode, buttons: { OkBtn: () => ReactNode; CancelBtn: () => ReactNode }) => ReactNode);
  okText?: ReactNode;
  cancelText?: ReactNode;
  confirmLoading?: boolean;
  okButtonProps?: DialogActionProps;
  cancelButtonProps?: DialogActionProps;
  closable?: boolean | { disabled?: boolean; closeIcon?: ReactNode };
  closeIcon?: ReactNode;
  keyboard?: boolean;
  mask?: boolean | { closable?: boolean; blur?: boolean };
  maskClosable?: boolean;
  centered?: boolean;
  width?: number | string;
  zIndex?: number;
  rootClassName?: string;
  styles?: Partial<Record<DialogSlot, CSSProperties>>;
  classNames?: Partial<Record<DialogSlot, string>>;
  destroyOnHidden?: boolean;
  destroyOnClose?: boolean;
  forceRender?: boolean;
  afterClose?: () => void;
  afterOpenChange?: (open: boolean) => void;
  modalRender?: (node: ReactNode) => ReactNode;
  getContainer?: HTMLElement | (() => HTMLElement) | false;
  focusable?: { focusTriggerAfterClose?: boolean; trapFocus?: boolean };
  focusTriggerAfterClose?: boolean;
  /** Dragging the heading is enabled for desktop pointers by default. */
  draggable?: boolean;
  /** Mobile dialogs, including confirmations, default to a sliding bottom sheet. */
  mobilePresentation?: 'sheet' | 'dialog';
  /** Imperative/global confirmations can supply their opener's local theme. */
  themeSource?: HTMLElement | null;
}

/** Native, theme-scoped dialog with pointer dragging, focus containment and stacked portals. */
export function Modal({ open = false, title, children, onCancel, onOk, footer, okText = '确定', cancelText = '取消',
  confirmLoading, okButtonProps, cancelButtonProps, closable = true, closeIcon, keyboard = true,
  mask = true, maskClosable, centered = false, width = 520, zIndex = 1000, className, rootClassName,
  styles: slotStyles = {}, classNames = {}, style, destroyOnHidden, destroyOnClose, forceRender,
  afterClose, afterOpenChange, modalRender, getContainer, focusable, focusTriggerAfterClose,
  draggable = true, mobilePresentation = 'sheet', themeSource, role = 'dialog', ...attributes }: ModalProps) {
  const titleId = useId();
  const origin = useRef<HTMLSpanElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [hasOpened, setHasOpened] = useState(open);
  const [pending, setPending] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState<DialogPoint>({ x: 0, y: 0 });
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>({});
  const drag = useRef<{ pointer: number; start: DialogPoint; offset: DialogPoint } | null>(null);
  const parentLayer = useContext(PopoverLayerContext);
  const insideNodes = useRef(new Set<HTMLElement>());
  const latest = useRef({ onCancel, keyboard, open, busy: false, restore: true, trap: true });
  const busy = !!confirmLoading || pending;
  latest.current = { onCancel, keyboard, open, busy, restore: focusable?.focusTriggerAfterClose ?? focusTriggerAfterClose ?? true,
    trap: focusable?.trapFocus ?? true };
  const layerValue = useMemo(() => ({
    markInside: (event: Event) => parentLayer?.markInside(event),
    registerInside: (node: HTMLElement) => {
      insideNodes.current.add(node);
      const unregister = parentLayer?.registerInside(node);
      return () => { insideNodes.current.delete(node); unregister?.(); };
    }
  }), [parentLayer]);
  const afterChange = useCallback((next: boolean) => {
    if (!next) {
      const target = opener.current;
      opener.current = null;
      const active = target?.ownerDocument.activeElement;
      const activeDialog = active instanceof Element ? active.closest('[aria-modal="true"]') : null;
      if (latest.current.restore && target?.isConnected && (!activeDialog || activeDialog === panel)) target.focus({ preventScroll: true });
      afterClose?.();
    }
    afterOpenChange?.(next);
  }, [afterClose, afterOpenChange, panel]);
  const presence = usePopoverPresence(open, !!panel, false, afterChange, 480);
  const present = presence.present;
  const renderContent = forceRender || open || present || (hasOpened && !(destroyOnHidden ?? destroyOnClose));
  const stack = useOverlayStack(present, panel, 'modal', zIndex, origin.current);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  usePopoverTheme(themeSource ?? origin.current, boundary, renderContent);

  useLayoutEffect(() => {
    if (open) {
      opener.current = origin.current?.ownerDocument.activeElement instanceof HTMLElement ? origin.current.ownerDocument.activeElement : null;
      setHasOpened(true);
      setOffset({ x: 0, y: 0 });
      setError('');
    }
  }, [open]);
  useLayoutEffect(() => {
    const doc = origin.current?.ownerDocument;
    if (!doc) return;
    setPortalContainer(getContainer === false ? null : typeof getContainer === 'function' ? getContainer() : getContainer ?? doc.body);
  }, [getContainer]);
  useLayoutEffect(() => {
    if (panel && parentLayer && present) return parentLayer.registerInside(panel);
  }, [panel, parentLayer, present]);
  useEffect(() => {
    if (!present || !panel) return;
    const doc = panel.ownerDocument;
    const unlock = lockDialogScroll(doc);
    const focusFirst = () => {
      const autofocus = panel.querySelector<HTMLElement>('[autofocus],[data-autofocus]');
      (autofocus ?? getDialogFocusable([panel])[0] ?? panel).focus({ preventScroll: true });
    };
    focusFirst();
    const isInside = (node: Node | null) => !!node && (panel.contains(node) || [...insideNodes.current].some(item => item.contains(node)));
    const handleFocus = (event: FocusEvent) => {
      if (latest.current.open && latest.current.trap && stackRef.current.isTopModal() && !isInside(event.target as Node)) focusFirst();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !latest.current.open) return;
      if (event.key === 'Escape' && stackRef.current.isTop()) {
        if (latest.current.keyboard && !latest.current.busy && !actionPending.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          latest.current.onCancel?.(event);
        }
        return;
      }
      if (event.key !== 'Tab' || !latest.current.trap || !stackRef.current.isTopModal()) return;
      const nodes = getDialogFocusable([panel, ...insideNodes.current]);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); panel.focus({ preventScroll: true }); }
      else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === panel || !isInside(doc.activeElement))) {
        event.preventDefault(); last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (doc.activeElement === last || !isInside(doc.activeElement) || doc.activeElement === panel)) {
        event.preventDefault(); first.focus({ preventScroll: true });
      }
    };
    doc.addEventListener('focusin', handleFocus);
    doc.addEventListener('keydown', handleKey);
    return () => {
      unlock();
      doc.removeEventListener('focusin', handleFocus);
      doc.removeEventListener('keydown', handleKey);
    };
  }, [present, panel]);
  useEffect(() => () => {
    if (latest.current.restore && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
  }, []);

  const clamp = (point: DialogPoint) => {
    if (!panel) return point;
    const win = panel.ownerDocument.defaultView!;
    const rect = panel.getBoundingClientRect();
    const view = win.visualViewport;
    return clampDialogDrag(point, { left: rect.left - offset.x, top: rect.top - offset.y, width: rect.width, height: rect.height },
      { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0, width: view?.width ?? win.innerWidth, height: view?.height ?? win.innerHeight });
  };
  useEffect(() => {
    if (!open || !panel) return;
    const win = panel.ownerDocument.defaultView!;
    const syncViewport = () => {
      const viewport = win.visualViewport;
      setViewportStyle({ top: viewport?.offsetTop ?? 0, left: viewport?.offsetLeft ?? 0,
        width: viewport?.width ?? win.innerWidth, height: viewport?.height ?? win.innerHeight,
        '--dialog-viewport-height': `${viewport?.height ?? win.innerHeight}px` } as CSSProperties);
    };
    const reclamp = () => {
      syncViewport();
      if (win.matchMedia('(max-width: 640px)').matches) setOffset({ x: 0, y: 0 });
      else setOffset(current => {
        const rect = panel.getBoundingClientRect();
        const viewport = win.visualViewport;
        return clampDialogDrag(current, { left: rect.left - current.x, top: rect.top - current.y, width: rect.width, height: rect.height },
          { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? win.innerWidth, height: viewport?.height ?? win.innerHeight });
      });
    };
    syncViewport();
    win.addEventListener('resize', reclamp);
    win.visualViewport?.addEventListener('resize', reclamp);
    win.visualViewport?.addEventListener('scroll', syncViewport);
    return () => { win.removeEventListener('resize', reclamp); win.visualViewport?.removeEventListener('resize', reclamp); win.visualViewport?.removeEventListener('scroll', syncViewport); };
  }, [open, panel]);
  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (!draggable || event.button !== 0 || event.pointerType === 'touch' || !panel
      || panel.ownerDocument.defaultView?.matchMedia('(max-width: 640px)').matches
      || (event.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"],[data-no-drag]')) return;
    event.preventDefault();
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.dataset.dragging = 'true';
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    setOffset(clamp({ x: current.offset.x + event.clientX - current.start.x, y: current.offset.y + event.clientY - current.start.y }));
  };
  const endDrag = () => { drag.current = null; if (panel) delete panel.dataset.dragging; };
  const cancel = (event: MouseEvent<HTMLElement>) => { if (!busy && !actionPending.current) onCancel?.(event); };
  const ok = async (event: MouseEvent<HTMLElement>) => {
    if (busy || actionPending.current) return;
    actionPending.current = true;
    setError('');
    try {
      const result = onOk?.(event);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setPending(true);
        await result;
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试。'); }
    finally { actionPending.current = false; setPending(false); }
  };
  const OkBtn = () => { const { danger, ...props } = okButtonProps ?? {}; return <Button {...props} variant="primary" data-danger={danger || undefined} loading={busy || !!props.loading} onClick={ok}>{okText}</Button>; };
  const CancelBtn = () => { const { danger, ...props } = cancelButtonProps ?? {}; return <Button {...props} data-danger={danger || undefined} disabled={busy || props.disabled} onClick={cancel}>{cancelText}</Button>; };
  const actions = <div className={styles.actions}>{CancelBtn()}{OkBtn()}</div>;
  const renderedFooter = typeof footer === 'function' ? footer(actions, { OkBtn, CancelBtn }) : footer === undefined ? actions : footer;
  const closeDisabled = busy || (typeof closable === 'object' && closable.disabled);
  const hasTitle = title !== undefined && title !== null && title !== false && title !== '';
  const panelNode = <div {...attributes} ref={setPanel} role={role} aria-modal="true" aria-labelledby={attributes['aria-labelledby'] ?? (hasTitle ? titleId : undefined)}
    aria-label={attributes['aria-label'] ?? (!hasTitle && !attributes['aria-labelledby'] ? '对话框' : undefined)} tabIndex={-1}
    className={[styles.panel, 'ui-modal', 'ui-modal-container', className, classNames.container].filter(Boolean).join(' ')}
    data-mobile-presentation={mobilePresentation} data-dragging={drag.current ? 'true' : undefined}
    style={{ width, ...(style?.top !== undefined ? { maxHeight: 'calc(var(--dialog-viewport-height, 100dvh) - 2rem)' } : {}),
      ...style, ...slotStyles.container, '--dialog-drag-x': `${offset.x}px`, '--dialog-drag-y': `${offset.y}px` } as CSSProperties}
    onTransitionEnd={presence.onTransitionEnd}>
    {(hasTitle || closable) && <header className={[styles.title, 'ui-modal-header', classNames.header].filter(Boolean).join(' ')} style={slotStyles.header}
      data-draggable={draggable || undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <div className={[styles.titleText, 'ui-modal-title', classNames.title].filter(Boolean).join(' ')} style={slotStyles.title} id={titleId}>{title}</div>
      {closable && <Button className="ui-modal-close" variant="ghost" size="sm" iconOnly aria-label="关闭弹窗" title="关闭" disabled={!!closeDisabled}
        icon={closeIcon ?? (typeof closable === 'object' ? closable.closeIcon : undefined) ?? <Icon name="close" />} onClick={cancel} />}
    </header>}
    <div className={[styles.body, 'ui-modal-body', classNames.body].filter(Boolean).join(' ')} style={slotStyles.body}>{children}{error && <p className={styles.error} role="alert">{error}</p>}</div>
    {renderedFooter !== null && renderedFooter !== false && <footer className={[styles.footer, 'ui-modal-footer', classNames.footer].filter(Boolean).join(' ')} style={slotStyles.footer}>{renderedFooter}</footer>}
  </div>;
  const dialog = <PopoverLayerContext.Provider value={layerValue}><div ref={setBoundary}
    className={[styles.root, 'ui-modal-root', rootClassName, classNames.root].filter(Boolean).join(' ')} style={{ zIndex: stack.zIndex, ...viewportStyle, ...slotStyles.root }}
    data-state={presence.phase} data-mobile-presentation={mobilePresentation} data-centered={centered || undefined}
    onMouseDownCapture={event => layerValue.markInside(event.nativeEvent)} onTouchStartCapture={event => layerValue.markInside(event.nativeEvent)}>
    {mask !== false && <div aria-hidden="true" className={[styles.mask, 'ui-modal-mask', classNames.mask].filter(Boolean).join(' ')} style={slotStyles.mask} />}
    <div className={[styles.wrap, 'ui-modal-wrap', classNames.wrapper].filter(Boolean).join(' ')} style={{ ...(style?.top !== undefined ? { paddingTop: 0, alignItems: 'flex-start' } : {}), ...slotStyles.wrapper }}
      onMouseDown={event => { if (event.target === event.currentTarget && stack.isTop() && mask !== false && (maskClosable ?? (typeof mask === 'object' ? mask.closable : undefined) ?? true)) cancel(event); }}>
      <div className={styles.container}>{modalRender ? modalRender(panelNode) : panelNode}</div>
    </div>
  </div></PopoverLayerContext.Provider>;
  return <><span ref={origin} hidden aria-hidden="true" />{renderContent && (getContainer === false ? dialog : portalContainer && createPortal(dialog, portalContainer))}</>;
}
