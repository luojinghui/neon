'use client';

import { ConfigProvider, theme as antdTheme } from 'antd';
import { useTheme } from '@/store/ThemeContext';
import { useEffect } from 'react';

export default function ClientThemeWrapper({ children }: { children: React.ReactNode }) {
  const { themeColor, themeMode } = useTheme();

  // Map theme colors to Ant Design's primary color
  const themeColorMap: Record<string, string> = {
    blue: '#2563eb',
    green: '#16a34a',
    purple: '#9333ea',
    red: '#dc2626',
    amber: '#d97706'
  };

  // Update document's data-theme attribute when theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeColor);
  }, [themeColor]);

  return (
    <ConfigProvider
      theme={{
        algorithm: themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: themeColorMap[themeColor] || '#2563eb',
          borderRadius: 6
        }
      }}
    >
      {children}
    </ConfigProvider>
  );
}
