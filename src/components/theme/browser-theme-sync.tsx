'use client';

import { useLayoutEffect } from 'react';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { PWA_THEME_COLORS } from '@/lib/pwa';

/** Match the installed app's native title/status bar to the selected app theme. */
export function BrowserThemeSync() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;

    // SSR media queries provide a system-theme fallback before hydration. Update
    // both entries because a manual app theme can differ from the system theme.
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = PWA_THEME_COLORS[resolvedTheme];
    });
  }, [resolvedTheme, pathname]);

  return null;
}
