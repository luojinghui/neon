'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CloudTabs() {
  const pathname = usePathname();
  const isPlaza = pathname.startsWith('/cloud/plaza');
  return <nav aria-label="云传导航" className="cloud-tabs">
    <Link href="/cloud" aria-current={!isPlaza ? 'page' : undefined} className={!isPlaza ? 'is-active' : ''}>云传</Link>
    <Link href="/cloud/plaza" aria-current={isPlaza ? 'page' : undefined} className={isPlaza ? 'is-active' : ''}>广场</Link>
  </nav>;
}
