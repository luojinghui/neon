'use client';

import '@/styles/index.css';
import { LeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useEffect } from 'react';
import Link from 'next/link';
import { useCloudStore } from './store';
import { neonCloud } from './core';
import { Show } from '@/components/base/show';
import ContentEditor from './components/ContentEditor';
import ContentInfo from './components/ContentInfo';
import QRModal from './components/QRModal';
import HistoryModal from './components/HistoryModal';
import JsonModal from './components/JsonModal';

function CloudPage() {
  const { message } = App.useApp();

  // 从 store 获取显示状态
  const { showContentInfo, password } = useCloudStore((state) => ({
    showContentInfo: state.showContentInfo,
    password: state.password
  }));

  useEffect(() => {
    neonCloud.setMessage(message);
  }, [message]);

  useEffect(() => {
    neonCloud.init();
  }, []);

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col pb-10 select-none">
      {/* Header */}
      <div className="header fixed top-0 left-0 w-full z-10">
        <div className="max-w-screen-xl mx-auto px-4 h-14 m-3">
          <div className="flex items-center justify-between space-x-2 bg-white/90 p-2 rounded-[6px]">
            <Link href={'/'} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 transition-all duration-300 shadow-sm hover:shadow-md hover:bg-gray-200">
              <LeftOutlined className="text-xl text-gray-800" />
            </Link>
            <span className="text-lg font-medium">云传</span>
            <span></span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content w-full pt-20 pb-8 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-screen-xl mx-auto px-4 space-y-6">
          <ContentEditor />

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
