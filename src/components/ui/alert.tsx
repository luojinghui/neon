'use client';

import { useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './icon';
import { Button } from './button';
import { Modal, type ModalProps } from './modal';
import styles from './dialog.module.css';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  type?: 'success' | 'info' | 'warning' | 'error';
  message?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  showIcon?: boolean;
  icon?: ReactNode;
  action?: ReactNode;
  closable?: boolean | { closeIcon?: ReactNode; 'aria-label'?: string };
  closeText?: ReactNode;
  onClose?: (event: MouseEvent<HTMLElement>) => void;
  afterClose?: () => void;
  banner?: boolean;
}
const icons = { success: <Icon name="check-circle" />, info: <Icon name="info-circle" />, warning: <Icon name="exclamation-circle" />, error: <Icon name="close-circle" /> };

/** Soft, same-theme status notice; no selectable chrome or native tap flash. */
export function Alert({ type = 'info', message, title, description, showIcon = false, icon, action, closable,
  closeText, onClose, afterClose, banner, className, children, ...props }: AlertProps) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return <div {...props} role={props.role ?? (type === 'error' || type === 'warning' ? 'alert' : 'status')}
    className={[styles.alert, className].filter(Boolean).join(' ')} data-ui-alert="" data-type={type} data-banner={banner || undefined}>
    {showIcon && <span className={styles.alertIcon} aria-hidden="true">{icon ?? icons[type]}</span>}
    <div className={styles.alertContent}>
      {(message ?? title) && <div className={styles.alertMessage}>{message ?? title}</div>}
      {(description ?? children) && <div className={styles.alertDescription}>{description ?? children}</div>}
    </div>
    {(action || closable || closeText) && <div className={styles.alertAction}>{action}{(closable || closeText) && <Button variant="ghost" size="sm"
      iconOnly={!closeText} aria-label={typeof closable === 'object' ? closable['aria-label'] ?? '关闭提示' : '关闭提示'}
      icon={closeText ? undefined : typeof closable === 'object' ? closable.closeIcon ?? <Icon name="close" /> : <Icon name="close" />}
      onClick={event => { onClose?.(event); if (!event.defaultPrevented) { setClosed(true); afterClose?.(); } }}>{closeText}</Button>}</div>}
  </div>;
}

export interface AlertDialogProps extends ModalProps { type?: AlertProps['type']; icon?: ReactNode; showIcon?: boolean }
/** Desktop confirmations stay centered; mobile confirmations share the native sheet motion. */
export function AlertDialog({ children, type = 'info', icon, showIcon = false, ...props }: AlertDialogProps) {
  return <Modal {...props} role="alertdialog" centered width={props.width ?? 420}>
    {showIcon && <div className={styles.alertDialogIcon} aria-hidden="true">{icon ?? icons[type]}</div>}{children}
  </Modal>;
}
