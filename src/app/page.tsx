'use client';

import { Container } from '@/components/container';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { MENU } from '@/store/nav.type';

export default function Home() {
  return (
    <div className="h-screen w-full bg bg12 overflow-hidden">
      <Header activeKey={MENU.home}></Header>

      <div className="h-screen w-full center flex-col text-white/70">
        <p className="text-3xl">欢迎来到Soul星球</p>
        <p className="text-sm mt-2">正在开发功能：云传</p>
      </div>

      <Container className="w-full fixed bottom-0 center">
        <Footer />
      </Container>
    </div>
  );
}
