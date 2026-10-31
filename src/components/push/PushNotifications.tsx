'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BellOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { ensureCurrentProfile } from '@/app/profile/client';

const SNOOZE_KEY = 'neon:push-prompt-snoozed-until';
const ENDPOINT_KEY = 'neon:push-endpoint';
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
let syncPromise: Promise<void> | null = null;

function registerWorker() {
  return registrationPromise ||= navigator.serviceWorker.register('/vision-sw.js', { scope: '/', updateViaCache: 'none' })
    .then(async () => navigator.serviceWorker.ready)
    .catch(error => { registrationPromise = null; throw error; });
}

async function pushRequest(path: string, init: RequestInit = {}) {
  const profile = await ensureCurrentProfile();
  const response = await fetch(`/api/push${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-neon-user-uuid': profile.uuid }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '消息通知暂时无法开启，请稍后重试');
  }
}

function syncSubscription(publicKey: string) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const registration = await registerWorker();
    let subscription = await registration.pushManager.getSubscription();
    const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    const currentKey = subscription?.options.applicationServerKey;
    if (subscription && currentKey && !bytes.every((value, index) => value === new Uint8Array(currentKey)[index])) {
      await pushRequest('/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    await pushRequest('/subscriptions', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
    try { localStorage.setItem(ENDPOINT_KEY, subscription.endpoint); } catch { /* Storage is optional. */ }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export function PushNotifications() {
  const pathname = usePathname();
  const eligible = /^\/(cloud|moments|soul)(\/|$)/.test(pathname);
  const [publicKey, setPublicKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eligible || !window.isSecureContext || !('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        if (Notification.permission === 'denied') {
          if (active) setVisible(false);
          let endpoint = '';
          try { endpoint = localStorage.getItem(ENDPOINT_KEY) || ''; } catch { /* Storage is optional. */ }
          if (endpoint) {
            await pushRequest('/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
            try { localStorage.removeItem(ENDPOINT_KEY); } catch { /* Storage is optional. */ }
          }
          return;
        }
        const response = await fetch('/api/push/config', { cache: 'no-store' });
        if (!response.ok) return;
        const config = await response.json() as { publicKey: string };
        if (!active) return;
        setPublicKey(config.publicKey);
        await registerWorker();
        if (!active) return;
        if (Notification.permission === 'granted') {
          await syncSubscription(config.publicKey);
          if (active) setVisible(false);
        } else {
          let snoozed = false;
          try { snoozed = Number(localStorage.getItem(SNOOZE_KEY)) > Date.now(); } catch { /* Storage is optional. */ }
          if (active) setVisible(!snoozed);
        }
      } catch { /* A failed background sync must not interrupt the current page. */ }
      finally { checking = false; }
    };
    void check();
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => { active = false; window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
  }, [eligible]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Keep this call directly in the click handler to preserve user activation.
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await syncSubscription(publicKey);
        setVisible(false);
      } else {
        dismiss();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '开启失败，请稍后重试');
    } finally { setBusy(false); }
  };

  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 86400000)); } catch { /* Storage is optional. */ }
    setVisible(false);
  };

  if (!eligible || !visible) return null;
  return <aside aria-label="消息通知" className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-[70] mx-auto max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-lg sm:left-auto sm:right-6">
    <div className="flex items-start gap-3">
      <BellOutlined className="mt-1 text-lg text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">开启消息通知</p>
        <p className="mt-1 text-xs leading-5 text-foreground-secondary">接收 Soul星球的新消息和站内更新，点击通知即可打开相关页面。</p>
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3 flex items-center gap-4">
          <button type="button" disabled={busy} onClick={() => void enable()} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? <><LoadingOutlined /> 正在开启</> : error ? '重试开启' : '开启通知'}</button>
          <button type="button" disabled={busy} onClick={dismiss} className="text-xs text-foreground-muted">暂不开启</button>
        </div>
      </div>
      <button type="button" aria-label="关闭通知提示" disabled={busy} onClick={dismiss} className="p-1 text-foreground-muted"><CloseOutlined /></button>
    </div>
  </aside>;
}
