import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Soul-云传',
  robots: { index: false, follow: false }
};

export default function CloudLayout({ children }: { children: React.ReactNode }) {
  return children;
}
