'use client';

import { useCallback, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Popover, type PopoverProps } from './popover';
import { Button, type ButtonProps } from './button';
import styles from './dialog.module.css';

export interface PopconfirmProps extends Omit<PopoverProps, 'title' | 'content'> {
  title: ReactNode | (() => ReactNode);
  description?: ReactNode | (() => ReactNode);
  disabled?: boolean;
  onConfirm?: (event?: MouseEvent<HTMLElement>) => unknown | Promise<unknown>;
  onCancel?: (event?: MouseEvent<HTMLElement>) => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: Pick<ButtonProps, 'disabled' | 'loading'> & { danger?: boolean };
  cancelButtonProps?: Pick<ButtonProps, 'disabled'>;
  showCancel?: boolean;
  onPopupClick?: (event: MouseEvent<HTMLElement>) => void;
}

/** Confirmation actions share the migrated native Popover and the site's Button. */
export function Popconfirm({ children, title, description, disabled, onConfirm, onCancel, okText = '确定', cancelText = '取消',
  okButtonProps, cancelButtonProps, showCancel = true, open, defaultOpen, onOpenChange, onPopupClick, ...props }: PopconfirmProps) {
  const [localOpen, setLocalOpen] = useState(!!defaultOpen);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const mountContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (node && node.ownerDocument.activeElement === openerRef.current) {
      node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
  }, []);
  const restoreFocus = () => {
    if (contentRef.current?.contains(document.activeElement) && openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
  };
  const close = () => { restoreFocus(); setLocalOpen(false); onOpenChange?.(false); };
  const changeOpen = (next: boolean) => {
    if (disabled || pendingRef.current || pending) return;
    if (next) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setError('');
      setLocalOpen(true);
      onOpenChange?.(true);
    } else close();
  };
  const content = <div ref={mountContent} role="alertdialog" aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined} className={styles.confirmation} onClick={onPopupClick}>
    <div id={titleId} className={styles.confirmationTitle}>{typeof title === 'function' ? title() : title}</div>
    {description && <div id={descriptionId} className={styles.description}>{typeof description === 'function' ? description() : description}</div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      {showCancel && <Button size="sm" disabled={pending || cancelButtonProps?.disabled} onClick={event => { onCancel?.(event); close(); }}>{cancelText}</Button>}
      <Button size="sm" variant="primary" loading={pending || !!okButtonProps?.loading} disabled={okButtonProps?.disabled} onClick={async event => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError('');
        try { await onConfirm?.(event); close(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试。'); }
        finally { pendingRef.current = false; setPending(false); }
      }}>{okText}</Button>
    </div>
  </div>;
  return <Popover {...props} role="presentation" trigger={props.trigger ?? 'click'} open={!disabled && (open ?? localOpen)} onOpenChange={changeOpen} content={content}>{children}</Popover>;
}
