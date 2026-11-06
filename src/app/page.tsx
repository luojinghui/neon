'use client';

import '@/styles/index.css';
import { Footer } from '@/components/footer';
import { Card } from '@/components/card';
import { HomeHero } from '@/components/home-hero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ProfileShortcut } from './profile/components/ProfileShortcut';
import { TopBar } from '@/components/topbar';
import { Icon } from '@/components/ui/icon';

export default function Home() {
  const cards = [
    {
      title: '云传',
      description: '文字与文件，轻松传递',
      href: '/cloud',
      icon: <Icon name="cloud" />,
      tone: 'info' as const
    },
    {
      title: '星球',
      description: '在此着陆，随意聊聊',
      href: '/soul',
      icon: <Icon name="globe" />,
      tone: 'primary' as const
    },
    {
      title: '心迹',
      description: '这颗星球的日常切片',
      href: '/moments',
      icon: <Icon name="heart" />,
      tone: 'accent' as const
    },
    {
      title: '漫游相机',
      description: '让表情变成漫画',
      href: '/doodle',
      icon: <Icon name="camera" />,
      tone: 'success' as const
    }
  ];

  return (
    <div className="app-screen flex w-full flex-col overflow-y-auto bg-background">
      <TopBar
        middle=""
        leading={<span className="inline-flex items-center gap-2 text-body-lg font-semibold tracking-tight"><Icon name="globe" className="text-title text-primary" />Soul</span>}
        right={<div className="flex items-center gap-2"><ProfileShortcut returnTo="/" /><ThemeToggle /></div>}
      />

      <main className="app-content-width flex-1 pb-8 pt-24 sm:pt-28">
        <HomeHero />

        <nav aria-label="探索 Soul 星球" className="mx-auto grid w-full max-w-[1008px] grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
          {cards.map((card) => (
            <Card key={card.href} {...card} />
          ))}
        </nav>
      </main>
      <Footer />
    </div>
  );
}
