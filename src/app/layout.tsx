import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/index.css';
import { cn } from '@/utils/cn';
import { Suspense } from 'react';
import { ThemeProvider } from '@/store/ThemeContext';
import ClientThemeWrapper from '../components/theme/theme-wrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

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
      <body className={cn('font-sans antialiased', inter.variable)} suppressHydrationWarning>
        <Suspense fallback={null}>
          <ThemeProvider>
            <ClientThemeWrapper>{children}</ClientThemeWrapper>
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
