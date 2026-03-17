'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useEffect, useState } from 'react';

function AntdThemeSync({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? 'hsl(24, 80%, 62%)' : 'hsl(24, 85%, 58%)',
          colorInfo: isDark ? 'hsl(200, 60%, 58%)' : 'hsl(200, 65%, 50%)',
          colorSuccess: isDark ? 'hsl(152, 45%, 50%)' : 'hsl(152, 50%, 42%)',
          colorWarning: isDark ? 'hsl(42, 75%, 58%)' : 'hsl(42, 85%, 52%)',
          colorError: isDark ? 'hsl(4, 60%, 60%)' : 'hsl(4, 65%, 56%)',
          borderRadius: 10,
          borderRadiusSM: 8,
          borderRadiusLG: 12
        }
      }}
    >
      {children}
    </ConfigProvider>
  );
}

export default function ClientThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AntdThemeSync>{children}</AntdThemeSync>
    </ThemeProvider>
  );
}
