'use client';

import '@ant-design/v5-patch-for-react-19';
import '@/styles/index.css';
import { Footer } from '@/components/footer';
import { Card } from '@/components/card';
import { ThemeSwitcher } from '@/components/theme';
import { useTheme } from '@/store/ThemeContext';

export default function Home() {
  const { themeMode } = useTheme();
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
    <div className="min-h-screen w-full bg-[rgb(var(--background))] transition-colors duration-300">
      <ThemeSwitcher />

      <div className="container mx-auto px-4 py-20">
        <h1 className="mb-20 text-center text-5xl font-bold">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[rgb(var(--gradient-from))] to-[rgb(var(--gradient-to))] animate-gradient-x">Soul星球</span>
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
