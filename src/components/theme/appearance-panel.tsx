'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { SKINS, useSkin } from './skins';
import styles from './appearance.module.css';

type Mode = 'system' | 'light' | 'dark';

/** Colour mode and skin in one place. Works inline (settings sheets, menus) or inside a popover. */
export function AppearancePanel({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [skin, setSkin] = useSkin();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const mode = (mounted ? theme ?? 'system' : 'system') as Mode;
  const current = SKINS.find(item => item.name === skin);

  return <div className={cn(styles.panel, className)}>
    <div className={styles.group}>
      <span className={styles.heading}>外观模式</span>
      <Tabs size="sm" block aria-label="外观模式" activeKey={mode} onChange={key => setTheme(key)} items={[
        { key: 'system', label: '自动' },
        { key: 'light', label: '浅色' },
        { key: 'dark', label: '深色' }
      ]} />
    </div>
    <div className={styles.group}>
      <span className={styles.heading}>主题色<em>{current?.label}</em></span>
      <div className={styles.swatches} role="radiogroup" aria-label="主题色">
        {SKINS.map(item => <Button key={item.name} variant="ghost" data-ui-surface="" type="button" role="radio" aria-checked={skin === item.name} aria-label={item.label}
          data-skin={item.name} className={styles.swatch} onClick={() => setSkin(item.name)}>
          <span className={styles.dot}><span className={styles.dotAccent} /></span>
          {skin === item.name && <Icon name="check" className={styles.check} />}
        </Button>)}
      </div>
    </div>
  </div>;
}
