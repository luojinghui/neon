'use client';

import '@ant-design/v5-patch-for-react-19';
import '@/styles/index.css';
import { Footer } from '@/components/footer';
import { Card } from '@/components/card';

export default function Home() {
  const cards = [
    {
      title: '云传',
      description: '快速、安全、便捷的文件传输服务',
      href: '/cloud'
    }
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <h1 className="mb-12 text-center text-5xl font-bold">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 animate-gradient-x">Soul星球</span>
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
