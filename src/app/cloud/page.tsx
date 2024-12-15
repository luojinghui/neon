'use client';

import { Header } from '@/components/header';
import { MENU } from '@/store/nav.type';
import { Textarea } from '@nextui-org/input';

export default function Page() {
  return (
    <div className="h-screen bg12 overflow-hidden">
      <Header activeKey={MENU.cloud}></Header>

      <div className="h-screen w-full center">
        <Textarea className="max-w-[80%]" placeholder="输入文本内容" />
      </div>
    </div>
  );
}
