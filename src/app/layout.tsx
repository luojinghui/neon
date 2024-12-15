import type { Metadata } from 'next';
import { Header } from '@/components/header';
import '@/styles/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soul Planet',
  description: 'Soul Planet For You',
  icons: '/favicon.ico'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Header></Header>
        {children}
      </body>
    </html>
  );
}
