'use client';

import { Tooltip } from 'antd';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={`inline-block h-8 w-8 ${className}`} />;
  }

  const mode = (theme ?? 'system') as 'light' | 'dark' | 'system';
  const isDarkResolved = resolvedTheme === 'dark';

  const nextMode: typeof mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
  const aria = mode === 'system' ? '当前：系统主题。点击切换到浅色模式' : mode === 'light' ? '当前：浅色模式。点击切换到深色模式' : '当前：深色模式。点击切换到系统主题';
  const tooltipTitle = mode === 'system' ? '系统' : mode === 'light' ? '浅色' : '深色';

  return (
    <Tooltip title={tooltipTitle} placement="bottom">
      <button
        onClick={() => setTheme(nextMode)}
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full
          bg-surface hover:bg-surface-hover border border-border
          transition-all duration-300 ${className}`}
        aria-label={aria}
      >
        {/* 图标语义：system 显示显示器；light 显示太阳；dark 显示月亮 */}
        {mode === 'system' ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-foreground-secondary">
            <path
              fillRule="evenodd"
              d="M3.5 4.5A2.5 2.5 0 016 2h8a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0114 14H6a2.5 2.5 0 01-2.5-2.5v-7zM6 3.5a1 1 0 00-1 1v7a1 1 0 001 1h8a1 1 0 001-1v-7a1 1 0 00-1-1H6z"
              clipRule="evenodd"
            />
            <path d="M6.75 16.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
          </svg>
        ) : isDarkResolved ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-foreground-secondary">
            <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
            <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.06 1.06l1.06 1.06z" />
          </svg>
        )}
      </button>
    </Tooltip>
  );
}
