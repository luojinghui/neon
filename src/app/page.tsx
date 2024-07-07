'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/container';
import { Box } from '@/components/box';
import { motion } from 'framer-motion';
import '@/styles/index.css';
import { Footer } from '@/components/footer';

export default function Home() {
  const [random, setRandom] = useState(1);
  let resp = null;

  const getData = async () => {
    const res = await fetch('/api/user');

    if (!res.ok) {
      throw new Error('Failed to fetch data');
    }

    return res.json();
  };

  useEffect(() => {
    (async () => {
      try {
        resp = await getData();
        console.log('=====data: ', resp);
      } catch (error) {
        console.log('=====fetch error: ', error);
      }
    })();

    setRandom(Math.round(Math.random() * 20));
  }, []);

  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container className="h-full relative">
        <Box className="pt-20">
          <div className=" relative">
            <motion.div initial={{ opacity: 0 }} animate={{ translateY: 12, scale: 1, opacity: 1 }} transition={{ duration: 1 }} className="text-6xl text-white font-medium">
              Neon Planet
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ translateY: 8, scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-6 text-base text-white font-medium"
            >
              漆黑夜里，风吹熄了星月，你却是我藏在血液里的光
            </motion.div>

            <motion.div
              className="absolute right-0 top-0 w-[260px]"
              initial={{ opacity: 0, x: 60, y: -30, scale: 0.8 }}
              whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeInOut', delay: 0.6 }}
            >
              <img src="/source/index.png" alt="Index" className="w-full h-full" />
            </motion.div>
          </div>
        </Box>

        <Box>
          <div className="mt-[150px] relative">
            <div className="share bg-white/50 rounded-[4px] p-8 backdrop-blur-sm">分享</div>
          </div>
        </Box>

        <Box>
          <div className="mt-20 relative">
            <div className="share bg-white/50 rounded-[4px] p-8">列表</div>
          </div>
        </Box>
      </Container>

      <Container className="w-full fixed bottom-0 center">
        <Footer />
      </Container>
    </div>
  );
}
