'use client';

import '@ant-design/v5-patch-for-react-19';
import { useEffect, useRef } from 'react';
import '@/styles/index.css';
import { Footer } from '@/components/footer';
import Link from 'next/link';

export default function Home() {
  const resp = useRef(null);

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
        resp.current = await getData();
        console.log('=====data: ', resp);
      } catch (error) {
        console.log('=====fetch error: ', error);
      }
    })();
  }, []);

  return (
    <div className="h-screen w-full overflow-hidden">
      <div className="center h-full w-full">
        <Link href={'/'} className="m-3">
          首页
        </Link>
        <Link href={'/cloud'} className="m-3">
          云传
        </Link>
      </div>
      <Footer />
    </div>
  );
}
