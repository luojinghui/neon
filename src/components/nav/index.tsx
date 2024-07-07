'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HomeFilled, TikTokFilled, PictureFilled, HeartFilled, SmileFilled } from '@ant-design/icons';
import clsx from 'clsx';
import Link from 'next/link';
import Image from 'next/image';
import { useNavStore } from '@/store/nav';
import { NAV } from '@/type/nav.type';

interface IProps {}

export function Nav(props: IProps) {
  // const { activeKey, setActiveKey } = useNavStore();
  const [activeKey, setActiveKey] = useState(NAV.index);
  const list = [
    {
      title: '首页',
      ICON: HomeFilled,
      key: NAV.index,
      route: '/'
    },
    {
      title: '星球',
      ICON: HeartFilled,
      key: NAV.neon,
      route: '/chat'
    },
    {
      title: '音乐',
      ICON: TikTokFilled,
      key: NAV.music,
      route: '/music'
    },
    {
      title: '壁纸',
      ICON: PictureFilled,
      key: NAV.picture,
      route: '/picture'
    },
    {
      title: '我的',
      ICON: SmileFilled,
      key: NAV.mine,
      route: '/about'
    }
  ];

  const onClick = (key: NAV) => {
    setActiveKey(key);
  };

  return (
    <div className="fixed top-0 left-0 h-screen z-50 pl-5">
      <Image src="/source/logo.svg" className="mt-4 ml-2" draggable={false} alt="logo" width={58} height={58}></Image>

      <div className="absolute h-full left-0 top-0">
        <motion.ul className="h-full center flex-col pl-5">
          {list.map(({ title, ICON, key, route }) => {
            const iconClass = clsx('text-2xl opacity-90', `${key == activeKey ? 'text-red-400' : 'text-white'}`);

            return (
              <Link href={route} key={key}>
                <motion.li
                  onClick={() => {
                    onClick(key);
                  }}
                  className="group relative flex p-4 pl-6 pr-14 cursor-pointer transition rounded-md hover:bg-blue-400/70"
                >
                  <ICON className={iconClass} />
                  <span className="hidden text-sm  text-slate-50 absolute left-14 top-[18px] group-hover:block">{title}</span>
                </motion.li>
              </Link>
            );
          })}
        </motion.ul>
      </div>
    </div>
  );
}
