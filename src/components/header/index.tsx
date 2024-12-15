import React, { useState } from 'react';
import HomeIcon from '@/styles/svg/home.svg';
import CloudIcon from '@/styles/svg/cloud.svg';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils';
import { MENU } from '@/store/nav.type';
import { Tooltip } from '@nextui-org/tooltip';

interface IProps {
  activeKey: MENU;
  children?: React.ReactNode;
}

export const Header = (props: IProps) => {
  const router = useRouter();
  const { activeKey } = props;

  // const [activeKey, setActiveKey] = useState(MENU.home);

  const handleRoute = (href: MENU) => {
    router.push(href);
  };

  return (
    <div className="fixed top-2 w-full center">
      <ul className="h-ful  rounded flex p-1">
        <Tooltip content="首页" closeDelay={0}>
          <li
            className={cn('center hover:bg-neon-gray-100/25 transition-colors	mr-2.5 rounded', activeKey === MENU.home && 'pointer-events-none')}
            onClick={() => {
              handleRoute(MENU.home);
            }}
          >
            <HomeIcon alt="Home" className={cn('w-11 h-11 p-2', activeKey === MENU.home && 'fill-white')} />
          </li>
        </Tooltip>
        <Tooltip content="云传" closeDelay={0}>
          <li
            className={cn('center hover:bg-neon-gray-100/25 transition-colors	mr-2.5 rounded', activeKey === MENU.cloud && 'pointer-events-none')}
            onClick={() => {
              handleRoute(MENU.cloud);
            }}
          >
            <CloudIcon alt="Home" className={cn('w-11 h-11 p-2', activeKey === MENU.cloud && 'fill-white')} />
          </li>
        </Tooltip>
      </ul>
    </div>
  );
};
