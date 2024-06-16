'use client';

import Link from 'next/link';
import '@/styles/index.css';
import { useEffect, useState } from 'react';

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
    <div className={`h-screen flex justify-center items-center bg`}>
      <ul className="flex rounded-full transition bg-white/90 px-3 text-sm text-zinc-800 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10">
        <li>
          <Link className="relative block px-4 py-4 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/chat">
            星球
          </Link>
        </li>
        <li>
          <Link className="relative block px-4 py-4 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/music">
            音乐
          </Link>
        </li>
        <li>
          <Link className="relative block px-4 py-4 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/picture">
            图片
          </Link>
        </li>
        <li>
          <Link className="relative block px-4 py-4 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/video">
            视频
          </Link>
        </li>
      </ul>

      <ul className="ml-5 flex rounded-full transition bg-white/90 px-3 text-sm text-zinc-800 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10">
        <li>
          <Link className="relative block px-4 py-4 transition hover:text-cyan-500 dark:hover:text-cyan-400" href="/about">
            关于我
          </Link>
        </li>
      </ul>
    </div>
  );
}
