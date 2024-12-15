import type { Metadata } from 'next';
import '@/styles/index.css';
import './globals.css';
import { Providers } from './providers';

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
