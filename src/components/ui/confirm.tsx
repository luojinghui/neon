'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertDialog } from './alert';
import type { ModalProps } from './modal';
import styles from './dialog.module.css';

export type Confirmation = Pick<ModalProps, 'width' | 'draggable' | 'keyboard' | 'maskClosable' | 'closable' | 'themeSource'> & {
  title?: ReactNode;
  content?: ReactNode;
  centered?: boolean;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: { danger?: boolean; disabled?: boolean };
  onOk?: () => void | Promise<unknown>;
  onCancel?: () => void;
};
export type ConfirmHandle = { destroy: () => void; update: (options: Partial<Confirmation>) => void };
type Entry = Confirmation & { id: number; open: boolean; error?: string };
const ConfirmContext = createContext<{ confirm: (options: Confirmation) => ConfirmHandle } | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pending, setPending] = useState<number[]>([]);
  const nextId = useRef(0);
  const busyIds = useRef(new Set<number>());
  const lastInteraction = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // iOS Safari can click a button without focusing it; retain its theme scope too.
    const remember = (event: PointerEvent) => {
      if (event.target instanceof HTMLElement) lastInteraction.current = event.target;
      else if (event.target instanceof Element) lastInteraction.current = event.target.parentElement;
    };
    document.addEventListener('pointerdown', remember, true);
    return () => document.removeEventListener('pointerdown', remember, true);
  }, []);
  const confirm = useCallback((options: Confirmation) => {
    const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const entry = { ...options, themeSource: options.themeSource ?? focused ?? lastInteraction.current, id: ++nextId.current, open: true };
    setEntries(current => [...current, entry]);
    return {
      destroy: () => setEntries(current => current.map(item => item.id === entry.id ? { ...item, open: false } : item)),
      update: (updates: Partial<Confirmation>) => setEntries(current => current.map(item => item.id === entry.id ? { ...item, ...updates } : item))
    };
  }, []);
  const value = useMemo(() => ({ confirm }), [confirm]);
  const close = (id: number) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, open: false } : entry));
  return <ConfirmContext.Provider value={value}>{children}{entries.map(entry => {
    const busy = pending.includes(entry.id);
    return <AlertDialog key={entry.id} open={entry.open} title={entry.title} centered={entry.centered ?? true} okText={entry.okText}
      themeSource={entry.themeSource} width={entry.width} draggable={entry.draggable}
      afterClose={() => setEntries(current => current.filter(currentEntry => currentEntry.id !== entry.id))}
      cancelText={entry.cancelText} confirmLoading={busy} closable={!busy && (entry.closable ?? true)} keyboard={!busy && (entry.keyboard ?? true)} mask={{ closable: !busy && (entry.maskClosable ?? true) }}
      cancelButtonProps={{ disabled: busy }} okButtonProps={entry.okButtonProps}
      onCancel={() => { if (!busy) { entry.onCancel?.(); close(entry.id); } }} onOk={async () => {
        if (busyIds.current.has(entry.id)) return;
        busyIds.current.add(entry.id);
        setEntries(current => current.map(currentEntry => currentEntry.id === entry.id ? { ...currentEntry, error: undefined } : currentEntry));
        setPending(current => [...current, entry.id]);
        try { await entry.onOk?.(); close(entry.id); }
        catch (error) {
          setEntries(current => current.map(currentEntry => currentEntry.id === entry.id
            ? { ...currentEntry, error: error instanceof Error ? error.message : '操作失败，请重试。' } : currentEntry));
        }
        finally { busyIds.current.delete(entry.id); setPending(current => current.filter(id => id !== entry.id)); }
      }}>{entry.content}{entry.error && <p className={styles.error} role="alert">{entry.error}</p>}</AlertDialog>;
  })}</ConfirmContext.Provider>;
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used inside ConfirmProvider');
  return value;
}
