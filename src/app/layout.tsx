import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import Music from '@/components/music';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Neon Planet-霓虹星球',
  description: '霓虹星球，寻找属于你的星球',
  icons: '/favicon.ico'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(inter.className, 'font-sans antialiased', inter.variable)}>
        {/* <Music></Music> */}
        {children}
      </body>
    </html>
  );
}
