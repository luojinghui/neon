'use client';

import Link from 'next/link';
import { socket } from '@/socket.mjs';
import { useEffect, useState } from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import '@/styles/index.css';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const onHandleWebSocket = () => {};

  return (
    <div className="h-screen bg12">
      <div className="flex justify-center items-center pt-5">
        <Link
          href={'/'}
          className="flex mr-5 h-10 w-10 items-center justify-center rounded-full bg-white shadow-md shadow-zinc-800/5 ring-1 ring-zinc-900/5 transition dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0 dark:ring-white/10 dark:hover:border-zinc-700 dark:hover:ring-white/20"
        >
          <ArrowLeftOutlined />
        </Link>

        <nav className="pointer-events-auto">
          <ul className="flex rounded-full bg-white/90 px-3 text-sm text-zinc-800 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10">
            <li>
              <Link className="relative block px-4 py-3 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/chat">
                星球
              </Link>
            </li>
            <li>
              <Link className="relative block px-4 py-3 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/music">
                音乐
              </Link>
            </li>
            <li>
              <Link className="relative block px-4 py-3 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/video">
                面对面
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
