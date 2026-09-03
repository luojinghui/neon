import type { Metadata } from 'next';
import { DoodleStudioWithApp } from './DoodleStudio';

export const metadata: Metadata = {
  title: '漫游相机 · Soul 星球',
  description: '把今天的表情，变成一张有称号的漫画涂鸦。'
};

export default function DoodlePage() {
  return <DoodleStudioWithApp />;
}
