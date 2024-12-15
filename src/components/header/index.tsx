'use client';

import React, { useState } from 'react';
import HomeIcon from '@/styles/svg/home.svg';
import CloudIcon from '@/styles/svg/cloud.svg';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils';
import { useNavStore } from '@/store/nav';
import { MENU } from '@/store/nav.type';

export const Header = () => {
  const router = useRouter();
  const setActiveKey = useNavStore((state) => state.setActiveKey);

  const handleRoute = (href: MENU) => {
    setActiveKey(href);
    router.push(href);
  };

  return (
    <div className="fixed top-1/2 w-full center">
      <ul className="h-ful rounded flex p-2">
        <li
          className={cn('center hover:bg-neon-gray-100/25 transition-colors	mr-2.5 rounded')}
          onClick={() => {
            handleRoute(MENU.home);
          }}
        >
          <HomeIcon alt="Home" className="w-11 h-11 p-2" />
        </li>
        <li
          className={cn('center hover:bg-neon-gray-100/25 transition-colors	mr-2.5 rounded')}
          onClick={() => {
            handleRoute(MENU.cloud);
          }}
        >
          <CloudIcon alt="Home" className="w-11 h-11 p-2" />
        </li>
      </ul>
    </div>
  );
};
