'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icon';
import { Button } from './button';
import { PopoverLayerContext } from './popover/hooks/use-layer';
import { usePopoverTheme } from './popover/hooks/use-theme';
import { usePopoverPresence } from './popover/hooks/use-presence';
import { useOverlayStack } from './overlay-stack';
import { lockDialogScroll } from './dialog-utils';
import { cn } from '@/utils/cn';
import styles from './drawer.module.css';

type Slot = 'root' | 'mask' | 'wrapper' | 'section' | 'header' | 'body';
export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  placement?: 'bottom' | 'right' | 'left';
  /** Height for bottom, width for sides. Any CSS length. */
  size?: number | string;
  title?: ReactNode;
  closable?: boolean;
  keyboard?: boolean;
  mask?: boolean | { closable?: boolean };
  rootClassName?: string;
  classNames?: Partial<Record<Slot, string>>;
  forceRender?: boolean;
  destroyOnHidden?: boolean;
  afterOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

/** Edge-anchored panel sharing Modal's layering, theme scope, scroll lock and Escape handling. */
export function Drawer({ open = false, onClose, placement = 'right', size = 378, title, closable = true, keyboard = true, mask = true,
  rootClassName, classNames = {}, forceRender, destroyOnHidden, afterOpenChange, children }: DrawerProps) {
  const origin = useRef<HTMLSpanElement>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  const [hasOpened, setHasOpened] = useState(open);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const latest = useRef({ onClose, keyboard });
  latest.current = { onClose, keyboard };
  const presence = usePopoverPresence(open, !!panel, false, next => afterOpenChange?.(next), 480);
  const stack = useOverlayStack(presence.present, panel, 'modal', 1000, origin.current);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const render = forceRender || open || presence.present || (hasOpened && !destroyOnHidden);
  usePopoverTheme(origin.current, boundary, render);

  useLayoutEffect(() => { if (open) setHasOpened(true); }, [open]);
  useLayoutEffect(() => { if (origin.current) setContainer(origin.current.ownerDocument.body); }, []);
  useEffect(() => {
    if (!presence.present || !panel) return;
    const doc = panel.ownerDocument;
    const unlock = lockDialogScroll(doc);
    const opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    panel.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && latest.current.keyboard && stackRef.current.isTop()) { event.preventDefault(); latest.current.onClose?.(); }
    };
    doc.addEventListener('keydown', onKey);
    return () => { unlock(); doc.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [presence.present, panel]);

  const hasTitle = title != null && title !== false && title !== '';
  const maskClosable = typeof mask === 'object' ? mask.closable ?? true : true;
  const dimension = placement === 'bottom' ? { height: size } : { width: size };
  const node = <PopoverLayerContext.Provider value={{ markInside: () => {}, registerInside: () => () => {} }}>
    <div ref={setBoundary} className={cn(styles.root, rootClassName, classNames.root)} style={{ zIndex: stack.zIndex }} data-state={presence.phase} data-placement={placement}>
      {mask !== false && <div aria-hidden="true" className={cn(styles.mask, classNames.mask)} onMouseDown={() => { if (maskClosable && stack.isTop()) onClose?.(); }} />}
      <div className={cn(styles.wrapper, classNames.wrapper)} style={dimension as CSSProperties}>
        <div ref={setPanel} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : '抽屉'} tabIndex={-1} className={cn(styles.section, classNames.section)}
          onTransitionEnd={presence.onTransitionEnd}>
          {(hasTitle || closable) && <header className={cn(styles.header, classNames.header)}>
            <div className={styles.title}>{title}</div>
            {closable && <Button variant="ghost" size="sm" iconOnly aria-label="关闭" title="关闭" icon={<Icon name="close" />} onClick={onClose} />}
          </header>}
          <div className={cn(styles.body, classNames.body)}>{children}</div>
        </div>
      </div>
    </div>
  </PopoverLayerContext.Provider>;
  return <><span ref={origin} hidden aria-hidden="true" />{render && container && createPortal(node, container)}</>;
}
