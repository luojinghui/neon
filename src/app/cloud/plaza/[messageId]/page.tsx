import type { Metadata } from 'next';
import PlazaSharePage from './PlazaSharePage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '广场分享 · 云传', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  return <PlazaSharePage messageId={messageId} />;
}
