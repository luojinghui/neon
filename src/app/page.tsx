'use client';

import { useEffect } from 'react';
import { Container } from '@/components/container';
import { Footer } from '@/components/footer';
import { useNavStore } from '@/store/nav';

export default function Home() {
  const activeKey = useNavStore((state) => state.activeKey);

  useEffect(() => {
    console.log('===activeKey: ', activeKey);
  }, [activeKey]);

  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container className="w-full fixed bottom-0 center">
        <Footer />
      </Container>
    </div>
  );
}
