'use client';

import { useLayoutEffect } from 'react';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';

/** Match the installed app's native title/status bar to the selected app theme. */
export function BrowserThemeSync() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;

    const root = document.documentElement;
    const sync = () => {
      // Read the rendered background so CSS remains the source of truth for
      // both mode and skin. SSR colors are only a pre-hydration fallback.
      const background = getComputedStyle(root).backgroundColor;
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
        if (meta.content !== background) meta.content = background;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-skin'] });
    // Navigation/streamed metadata can replace the SSR fallback after this
    // effect runs. Reconcile those entries too; unchanged values avoid loops.
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['name', 'content'] });
    return () => observer.disconnect();
  }, [resolvedTheme, pathname]);

  return null;
}
