'use client';

import '@/styles/index.css';
import { App } from 'antd';
import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCloudStore } from './store';
import { neonCloud } from './core';
import { Show } from '@/components/base/show';
import ContentEditor from './components/ContentEditor';
import ContentInfo from './components/ContentInfo';
import FileInfo from './components/FileInfo';
import QRModal from './components/QRModal';
import HistoryModal from './components/HistoryModal';
import JsonModal from './components/JsonModal';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { TopBar } from '@/components/topbar';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import VersionModal from './components/VersionModal';
import NetworkInfo from './components/NetworkInfo';
import CloudTabs from './components/CloudTabs';
import Plaza from './plaza/Plaza';
import PlazaShareContent from './plaza/PlazaShareContent';
import { CLOUD_PATH, PLAZA_PATH, plazaSharePath } from './navigation';
import './cloud.css';

function CloudPage() {
  const params = useSearchParams();
  const isPlaza = params.get('tab') === 'plaza';
  const messageId = isPlaza ? params.get('id') : null;
  const queryPassword = isPlaza ? null : params.get('pwd');
  const viewKey = isPlaza ? messageId !== null ? `share:${messageId}` : 'plaza' : 'cloud';
  const scrollPositions = useRef<Record<string, number>>({});
  const handledQueryPassword = useRef<string | null>(null);
  const { message } = App.useApp();
  const contentRef = useRef<HTMLElement>(null);
  const shareInfoRef = useRef<HTMLDivElement>(null);
  const sendSuccessVersion = useCloudStore((state) => state.sendSuccessVersion);
  const handledSendVersion = useRef(sendSuccessVersion);

  const { showContentInfo, password } = useCloudStore((state) => ({
    showContentInfo: state.showContentInfo,
    password: state.password
  }));

  const queryFilesCount = useCloudStore((state) => state.queryFiles.length);

  useEffect(() => {
    neonCloud.setMessage(message);
  }, [message]);

  useEffect(() => {
    neonCloud.loadTextHistory();
  }, []);

  useEffect(() => {
    if (!queryPassword) { handledQueryPassword.current = null; return; }
    if (handledQueryPassword.current === queryPassword) return;
    handledQueryPassword.current = queryPassword;
    neonCloud.setQueryPassword(queryPassword);
    void neonCloud.queryMessage(queryPassword);
  }, [queryPassword]);

  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = scrollPositions.current[viewKey] ?? 0;
  }, [viewKey]);

  useEffect(() => {
    if (handledSendVersion.current === sendSuccessVersion) return;
    handledSendVersion.current = sendSuccessVersion;
    if (isPlaza || !showContentInfo || !password) return;

    const frame = requestAnimationFrame(() => {
      const state = useCloudStore.getState();
      if (!state.showContentInfo || state.password !== password || state.sendSuccessVersion !== sendSuccessVersion) return;
      const container = contentRef.current;
      const shareInfo = shareInfoRef.current;
      if (!container || !shareInfo) return;

      const containerBounds = container.getBoundingClientRect();
      const shareBounds = shareInfo.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visibleTop = Math.max(containerBounds.top + parseFloat(getComputedStyle(container).paddingTop), viewport?.offsetTop ?? 0);
      const visibleBottom = Math.min(containerBounds.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      if (shareBounds.top >= visibleTop && shareBounds.bottom <= visibleBottom) return;

      shareInfo.focus({ preventScroll: true });
      shareInfo.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'end'
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [sendSuccessVersion, showContentInfo, password, isPlaza]);

  return (
    <div className={`cloud-page${isPlaza ? ' plaza-page' : ''} app-screen w-full bg-background flex flex-col select-none`}>
      <TopBar middle={<CloudTabs />} backHref="/" backLabel="首页" right={<><NetworkInfo /><ProfileShortcut returnTo={isPlaza ? messageId !== null ? plazaSharePath(messageId) : PLAZA_PATH : CLOUD_PATH} /><ThemeToggle /></>} />

      {/* Content */}
      <main ref={contentRef} onScroll={event => { scrollPositions.current[viewKey] = event.currentTarget.scrollTop; }} className="content w-full pt-[var(--app-page-top)] pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="app-content-width">
          <div data-cloud-view="cloud" hidden={isPlaza} className="space-y-4">
            <ContentEditor />

            <Show is={queryFilesCount > 0}>
              <FileInfo />
            </Show>

            <Show is={showContentInfo && password}>
              <div ref={shareInfoRef} tabIndex={-1} role="region" aria-label="分享信息" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <ContentInfo />
              </div>
            </Show>
          </div>
          <div data-cloud-view="plaza" hidden={!isPlaza || messageId !== null}>
            <Plaza active={isPlaza && messageId === null} />
          </div>
          {isPlaza && messageId !== null && <div data-cloud-view="share"><PlazaShareContent key={messageId} messageId={messageId} /></div>}
        </div>
      </main>

      {/* Modals */}
      <VersionModal />
      <QRModal />
      <HistoryModal />
      <JsonModal />
    </div>
  );
}

export default function Home() {
  return (
    <App message={{ top: 'calc(var(--app-safe-top) + var(--app-topbar-height) + 0.5rem)' }}><Suspense fallback={<div className="app-screen bg-background" />}>
      <CloudPage />
    </Suspense></App>
  );
}
