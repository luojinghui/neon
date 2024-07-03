'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/container';
import { Box } from '@/components/box';
import { motion } from 'framer-motion';
import { HomeFilled, TikTokFilled, PictureFilled, HeartFilled, SmileFilled } from '@ant-design/icons';

import '@/styles/index.css';

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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        delayChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0 },
    show: { opacity: 1 }
  };

  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container relative mx-auto center>
        <div>
          <Image src="/source/logo.svg" className="absolute left-5 top-5" draggable={false} alt="logo" width={58} height={58}></Image>
        </div>
      </Container>

      <Container h-full relative className="">
        <div className="absolute left-3 h-full">
          <motion.ul className="h-full center flex-col" variants={container} initial="hidden" animate="show">
            <motion.li variants={item} className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70">
              <HomeFilled className="text-white text-2xl opacity-90" />
              <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">首页</span>
            </motion.li>
            <motion.li variants={item} className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70">
              <HeartFilled className="text-white text-2xl opacity-90" />
              <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">星球</span>
            </motion.li>
            <motion.li variants={item} className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70">
              <TikTokFilled className="text-white text-2xl opacity-90" />
              <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">音乐</span>
            </motion.li>
            <motion.li variants={item} className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70">
              <PictureFilled className="text-white text-2xl opacity-90" />
              <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">壁纸</span>
            </motion.li>
            <motion.li variants={item} className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70">
              <SmileFilled className="text-white text-2xl opacity-90" />
              <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">我的</span>
            </motion.li>
          </motion.ul>
        </div>

        <Box>
          <div className="mt-20 relative">
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
              initial={{ opacity: 0, x: 80, y: -40, scale: 0.8 }}
              whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeInOut', delay: 1 }}
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

      <Container full fixed bottom-0 center>
        <Container mx-auto center>
          <div className="center flex-col text-xs text-slate-50 opacity-50">
            <span className="">© {new Date().getFullYear()} Neon Planet-霓彩星球 - By JingHui</span>
            <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="" target="_blank">
              陕ICP备19012299号-1
            </a>
          </div>
        </Container>
      </Container>
    </div>
  );
}
