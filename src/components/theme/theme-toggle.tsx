'use client';

import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={`inline-block h-10 w-10 ${className}`} />;
  }

  const mode = (theme ?? 'system') as 'light' | 'dark' | 'system';

  const nextMode: typeof mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
  const aria = mode === 'system' ? '当前：系统主题。点击切换到浅色模式' : mode === 'light' ? '当前：浅色模式。点击切换到深色模式' : '当前：深色模式。点击切换到系统主题';

  return (
    <Button iconOnly
      type="button"
      onClick={() => setTheme(nextMode)}
      className={`touch-manipulation ${className}`}
      aria-label={aria}
    >
      <Icon name={mode === 'system' ? 'monitor' : resolvedTheme === 'dark' ? 'moon' : 'sun'} />
    </Button>
  );
}
