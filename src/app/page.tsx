'use client';

import '@/styles/index.css';
import { Footer } from '@/components/footer';
import { Card } from '@/components/card';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ProfileShortcut } from './profile/components/ProfileShortcut';
import { TopBar } from '@/components/topbar';
import { CameraOutlined, CloudOutlined, GlobalOutlined, HeartOutlined } from '@ant-design/icons';

export default function Home() {
  const cards = [
    {
      title: '云传',
      description: '简洁、高效的内容传输服务',
      href: '/cloud',
      icon: <CloudOutlined />,
      iconClassName: 'bg-info-soft text-info'
    },
    {
      title: '星球',
      description: '寻找属于自己的Soul星球',
      href: '/soul',
      icon: <GlobalOutlined />,
      iconClassName: 'bg-primary-soft text-primary'
    },
    {
      title: '心迹',
      description: '记录此刻心情，遇见真实的彼此',
      href: '/moments',
      icon: <HeartOutlined />,
      iconClassName: 'bg-accent-soft text-accent'
    },
    {
      title: '漫游相机',
      description: '把今天的表情，变成一张有称号的漫画涂鸦',
      href: '/doodle',
      icon: <CameraOutlined />,
      iconClassName: 'bg-success-soft text-success'
    }
  ];

  return (
    <div className="app-screen flex w-full flex-col overflow-y-auto bg-background">
      <TopBar
        middle=""
        leading={<span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"><GlobalOutlined className="text-xl text-primary" />Soul</span>}
        right={<div className="flex items-center gap-2"><ProfileShortcut returnTo="/" /><ThemeToggle /></div>}
      />

      <main className="app-content-width flex-1 pb-12 pt-28 sm:pt-36">
        <div className="mb-9 text-center sm:mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Soul 星球</h1>
          <p className="mt-3 text-sm leading-6 text-foreground-secondary">传递内容，分享此刻，遇见同频的你。</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
          {cards.map((card, index) => (
            <div key={index} className="min-w-0">
              <Card {...card} />
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
