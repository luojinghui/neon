'use client';

import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { useEffect, useState } from 'react';
import { AppearancePanel } from './appearance-panel';

/** Top-bar entry for appearance: colour mode and skin share one popover. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <span className={`inline-block h-10 w-10 ${className}`} />;

  return (
    <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}
      fitViewport boundaryPadding={12} width="min(288px, calc(100vw - 24px))" content={<AppearancePanel />}>
      <Button iconOnly type="button" className={`touch-manipulation ${className}`} aria-label="外观设置" aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="palette" />
      </Button>
    </Popover>
  );
}
