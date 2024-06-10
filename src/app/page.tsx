import Link from 'next/link';
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
    <div className="flex min-h-screen flex-col items-center justify-between p-4">
      <div>Home page</div>
      <div>user: {JSON.stringify(resp.data)}</div>

      <Link href="/chat">Chat</Link>
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
