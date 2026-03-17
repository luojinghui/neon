'use client';

import '@/styles/index.css';
import { Footer } from '@/components/footer';
import { Card } from '@/components/card';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function Home() {
  const cards = [
    {
      title: '云传',
      description: '简洁、高效的内容传输服务',
      href: '/cloud'
    },
    {
      title: '星球',
      description: '寻找属于自己的Soul星球',
      href: '/soul'
    }
  ];

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="container mx-auto px-4 py-20">
        <h1 className="mb-20 text-center text-5xl font-bold">
          <span className="bg-clip-text text-primary animate-gradient-x cursor-default">Soul星球</span>
        </h1>

        <div className="flex flex-wrap justify-center gap-6">
          {cards.map((card, index) => (
            <div key={index} className="w-full max-w-[400px]">
              <Card {...card} />
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
