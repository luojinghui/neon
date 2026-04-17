'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { ConfigProvider, theme as antdTheme } from 'antd';

function AntdThemeSync({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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
          // 与 src/styles/index.css 中 --border / --sidebar-border 一致，便于与 Tailwind border-border 统一
          colorBorder: isDark ? 'hsl(24, 10%, 22%)' : 'hsl(30, 14%, 88%)',
          colorBorderSecondary: isDark ? 'hsl(24, 10%, 20%)' : 'hsl(30, 14%, 90%)',
          // 分割线：沿用暖灰色相，透明度接近 antd 默认分割强度
          colorSplit: isDark ? 'hsla(30, 10%, 92%, 0.12)' : 'hsla(24, 15%, 22%, 0.08)',
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
