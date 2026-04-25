import type { Metadata, Viewport } from 'next';
import { cn } from '@/utils/cn';
import { Suspense } from 'react';
import ClientThemeWrapper from '../components/theme/theme-wrapper';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'Soul',
  description: 'Soul星球',
  icons: '/favicon.ico'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={cn('font-sans antialiased bg-background text-foreground')}>
        <Suspense fallback={null}>
          <ClientThemeWrapper>{children}</ClientThemeWrapper>
        </Suspense>
      </body>
    </html>
  );
}
