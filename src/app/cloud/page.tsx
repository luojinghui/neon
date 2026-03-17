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
import VersionModal from './components/VersionModal';
import { CLOUD_VERSION } from './version';

const VERSION_KEY = 'neon_cloud_version_acknowledged';

function CloudPage() {
  const { message } = App.useApp();

  const { showContentInfo, password, setIsVersionModalOpen } = useCloudStore((state) => ({
    showContentInfo: state.showContentInfo,
    password: state.password,
    setIsVersionModalOpen: state.setIsVersionModalOpen
  }));

  const queryFilesCount = useCloudStore((state) => state.queryFiles.length);

  useEffect(() => {
    neonCloud.setMessage(message);
  }, [message]);

  useEffect(() => {
    neonCloud.init();
  }, []);

  // 检查版本提示
  useEffect(() => {
    const acknowledgedVersion = localStorage.getItem(VERSION_KEY);
    if (acknowledgedVersion !== CLOUD_VERSION) {
      // 延迟一点显示，让页面先渲染完成
      const timer = setTimeout(() => {
        setIsVersionModalOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [setIsVersionModalOpen]);

  return (
    <div className="h-screen w-full bg-background flex flex-col select-none">
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
