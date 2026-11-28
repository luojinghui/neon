'use client';

import Link from 'next/link';
import { Button, buttonClassName } from '@/components/ui/button';
import { CUE_STYLES, cueStyle } from './cues';
import styles from './pool.module.css';

const RACK = ['#f0c400', '#1d4ed8', '#dc2626', '#171717', '#f97316', '#15803d'];

export function PoolLobby({
  cueId,
  onCue,
  onStart
}: {
  cueId: string;
  onCue: (id: string) => void;
  onStart: (kind: 'eight' | 'practice') => void;
}) {
  const cue = cueStyle(cueId);
  return (
    <div className={styles.lobby}>
      <header className={styles.lobbyBar}>
        <div>
          <h1 className="text-heading">台球</h1>
          <p className="text-caption text-foreground-secondary">中式八球</p>
        </div>
        <Link href="/" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>返回</Link>
      </header>
      <div className={styles.hero} aria-hidden="true">
        <span className={styles.heroLine} />
        <span className={styles.heroCue} style={{ background: cue.shaft }}>
          <span className={styles.heroTip} style={{ background: cue.tip }} />
        </span>
        <span className={styles.rack}>
          {[[RACK[0]], [RACK[1], RACK[2]], [RACK[3], RACK[4], RACK[5]]].map(row => (
            <span key={row.join()} className={styles.rackRow}>
              {row.map(color => <span key={color} style={{ background: color }} />)}
            </span>
          ))}
        </span>
      </div>
      <p className="text-body text-foreground-secondary">进桌以后整屏都是球台。右上角的白球用来切换视角和打点。</p>
      <Button variant="primary" size="lg" block onClick={() => onStart('eight')}>开始中八</Button>
      <Button size="lg" block onClick={() => onStart('practice')}>自由练习</Button>
      <section className="flex flex-col gap-2">
        <h2 className="text-title">球杆</h2>
        <div className={styles.cueGrid}>
          {CUE_STYLES.map(item => (
            <Button key={item.id} aria-pressed={item.id === cueId} align="start" onClick={() => onCue(item.id)}>
              <span className={styles.cueSwatch} style={{ background: item.shaft }} />
              {item.name}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
