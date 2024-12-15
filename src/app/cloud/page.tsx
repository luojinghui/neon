'use client';

import { useEffect } from 'react';
import { Container } from '@/components/container';
import { Box } from '@/components/box';
import { Footer } from '@/components/footer';
import { useNavStore } from '@/store/nav';

export default function Page() {
  const activeKey = useNavStore((state) => state.activeKey);

  useEffect(() => {
    console.log('===activeKey2: ', activeKey);
  }, [activeKey]);

  return (
    <div className="h-screen bg12 overflow-hidden">
      <div>文件传输</div>
    </div>
  );
}
