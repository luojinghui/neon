'use client';

import { ThemeProvider } from 'next-themes';
import { BrowserThemeSync } from './browser-theme-sync';
import { ConfirmProvider } from '@/components/ui/confirm';
import { MessageHost } from '@/components/ui/message';

export default function ClientThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserThemeSync />
      <ConfirmProvider>{children}</ConfirmProvider>
      <MessageHost />
    </ThemeProvider>
  );
}
