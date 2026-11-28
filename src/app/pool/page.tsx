import type { Metadata } from 'next';
import { PoolApp } from './PoolApp';

export const metadata: Metadata = {
  title: '中式八球 · Soul',
  description: '在浏览器里打一局三维中式八球，试试开球、定组、高低杆和加塞。'
};

export default function PoolPage() {
  return <PoolApp />;
}
