'use client';

import '@/styles/index.css';
import { App } from 'antd';
import { useEffect, useRef } from 'react';
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
import VersionModal from './components/VersionModal';

function CloudPage() {
  const { message } = App.useApp();
  const contentRef = useRef<HTMLDivElement>(null);
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
    neonCloud.init();
  }, []);

  useEffect(() => {
    if (handledSendVersion.current === sendSuccessVersion) return;
    handledSendVersion.current = sendSuccessVersion;
    if (!showContentInfo || !password) return;

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
  }, [sendSuccessVersion, showContentInfo, password]);

  return (
    <div className="app-screen w-full bg-background flex flex-col select-none">
      <TopBar middle="云传" backHref="/" backLabel="首页" right={<ThemeToggle />} />

      {/* Content */}
      <div ref={contentRef} className="content w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-[1312px] space-y-6 px-4">
          <ContentEditor />

          <Show is={queryFilesCount > 0}>
            <FileInfo />
          </Show>

          <Show is={showContentInfo && password}>
            <div ref={shareInfoRef} tabIndex={-1} role="region" aria-label="分享信息" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <ContentInfo />
            </div>
          </Show>
        </div>
      </div>

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
    <App>
      <CloudPage />
    </App>
  );
}
