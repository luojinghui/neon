'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icon';
import styles from './message.module.css';

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'loading';
type Item = { id: number; type: MessageType; content: ReactNode };
export interface MessageInstance {
  success: (content: ReactNode, duration?: number) => () => void;
  error: (content: ReactNode, duration?: number) => () => void;
  warning: (content: ReactNode, duration?: number) => () => void;
  info: (content: ReactNode, duration?: number) => () => void;
  loading: (content: ReactNode, duration?: number) => () => void;
  destroy: () => void;
}

const icons: Record<MessageType, IconName> = { success: 'check-circle', error: 'close-circle', warning: 'exclamation-circle', info: 'info-circle', loading: 'loading' };
let items: Item[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const remove = (id: number) => { items = items.filter(item => item.id !== id); emit(); };

function push(type: MessageType, content: ReactNode, duration = type === 'loading' ? 0 : 3) {
  const id = ++nextId;
  items = [...items.slice(-4), { id, type, content }];
  emit();
  if (duration > 0) setTimeout(() => remove(id), duration * 1000);
  return () => remove(id);
}

/** Global transient notices. Safe to call from non-React code once <MessageHost /> is mounted. */
export const message: MessageInstance = {
  success: (content, duration) => push('success', content, duration),
  error: (content, duration) => push('error', content, duration),
  warning: (content, duration) => push('warning', content, duration),
  info: (content, duration) => push('info', content, duration),
  loading: (content, duration) => push('loading', content, duration),
  destroy: () => { items = []; emit(); }
};

export function useMessage(): MessageInstance { return message; }

const empty: Item[] = [];
export function MessageHost() {
  const list = useSyncExternalStore(subscribe, () => items, () => empty);
  if (!list.length || typeof document === 'undefined') return null;
  return createPortal(<div className={styles.host} aria-live="polite">
    {list.map(item => <div key={item.id} className={styles.item} data-type={item.type} role={item.type === 'error' ? 'alert' : 'status'}>
      <Icon name={icons[item.type]} />{item.content}
    </div>)}
  </div>, document.body);
}
