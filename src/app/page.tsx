import Link from 'next/link';
import '@/styles/index.css';
import { useState } from 'react';

export default async function Home() {
  let resp = null;
  try {
    resp = await getData();
    console.log('=====data: ', resp);
  } catch (error) {
    console.log('=====fetch error: ', error);
  }

  return (
    <div className="h-screen flex justify-center items-center bg12">
      <div>
        <nav className="pointer-events-auto">
          <ul className="flex rounded-full transition bg-white/90 px-3 text-sm text-zinc-800 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10">
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

async function getData() {
  const res = await fetch('http://localhost:3000/api/user');

  if (!res.ok) {
    throw new Error('Failed to fetch data');
  }

  return res.json();
}
