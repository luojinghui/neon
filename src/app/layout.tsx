import type { Metadata } from 'next';
import './globals.css';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'Neon Planet',
  description: 'Neon Planet For You',
  icons: '/favicon.ico'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
