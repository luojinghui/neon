import type { Metadata } from 'next';
import '@/styles/var.css';
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
