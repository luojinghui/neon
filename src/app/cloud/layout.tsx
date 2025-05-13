import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Soul-云传'
};

export default function CloudLayout({ children }: { children: React.ReactNode }) {
  return children;
}
