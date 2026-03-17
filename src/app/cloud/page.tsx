'use client';

import '@/styles/index.css';
import { App } from 'antd';
import { useEffect } from 'react';
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

function CloudPage() {
  const { message } = App.useApp();

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

  return (
    <div className="h-screen w-full bg-background flex flex-col pb-10 select-none">
      <TopBar middle="云传" right={<ThemeToggle />} />

      {/* Content */}
      <div className="content w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-screen-xl mx-auto px-4 space-y-6">
          <ContentEditor />

          <Show is={queryFilesCount > 0}>
            <FileInfo />
          </Show>

          <Show is={showContentInfo && password}>
            <ContentInfo />
          </Show>
        </div>
      </div>

      {/* Modals */}
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
