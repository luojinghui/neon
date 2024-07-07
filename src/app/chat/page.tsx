'use client';

import { Container } from '@/components/container';
import { Box } from '@/components/box';
import '@/styles/index.css';
import { useNavStore } from '@/store/nav';

export default function Home() {
  const { activeKey } = useNavStore();

  console.log('chat activeKey', activeKey);

  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container className="h-full relative">
        <Box>
          <div className="share bg-white/50 rounded-[4px] p-8 backdrop-blur-sm">聊天室</div>
        </Box>
      </Container>
    </div>
  );
}
