import type { Metadata } from 'next';

export const metadata: Metadata = { title: '广场 · 云传', robots: { index: false, follow: false } };

export default function PlazaLayout({ children }: { children: React.ReactNode }) { return children; }
