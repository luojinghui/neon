import type { Metadata, Viewport } from 'next';
import { cn } from '@/utils/cn';
import { Suspense } from 'react';
import ClientThemeWrapper from '../components/theme/theme-wrapper';
import { PWA_ICON_VERSION, PWA_NAME, PWA_THEME_COLORS } from '@/lib/pwa';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'Soul',
  description: 'Soul星球',
  applicationName: PWA_NAME,
  appleWebApp: {
    capable: true,
    title: PWA_NAME,
    // Let iOS keep status-bar text legible in both light and dark appearances.
    statusBarStyle: 'default'
  },
  icons: {
    icon: [
      { url: `/favicon.ico?v=${PWA_ICON_VERSION}`, sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: `/icons/favicon-32.png?v=${PWA_ICON_VERSION}`, sizes: '32x32', type: 'image/png' },
      { url: `/icons/soul.svg?v=${PWA_ICON_VERSION}`, sizes: 'any', type: 'image/svg+xml' }
    ],
    apple: [{ url: `/icons/apple-touch-icon.png?v=${PWA_ICON_VERSION}`, sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PWA_THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: PWA_THEME_COLORS.dark }
  ]
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning className={cn('font-sans antialiased bg-background text-foreground')}>
        <Suspense fallback={null}>
          <ClientThemeWrapper>{children}</ClientThemeWrapper>
        </Suspense>
      </body>
    </html>
  );
}
