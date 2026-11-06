'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { PlanetIllustration } from '@/components/ui/planet-illustration';
import { HomeGreeting } from '@/components/home-greeting';
import styles from './home-hero.module.css';

const whispers = ['嗨，欢迎着陆 ✨', '今天过得怎么样？', '去星球逛逛吧', '有想传的东西吗？', '留下一点心迹吧', '轻轻戳我一下～'];
const stars = [
  { x: '8%', y: '22%', d: '0s', s: 4 }, { x: '20%', y: '64%', d: '1.2s', s: 3 }, { x: '34%', y: '12%', d: '2.1s', s: 3 },
  { x: '68%', y: '16%', d: '.6s', s: 4 }, { x: '82%', y: '58%', d: '1.7s', s: 3 }, { x: '92%', y: '26%', d: '2.6s', s: 4 }
];

/** Title + greeting stay as-is; the planet leans toward the pointer and answers taps with a bubble. */
export function HomeHero() {
  const stage = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [bubble, setBubble] = useState(false);
  const [bounce, setBounce] = useState(0);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const lean = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el || event.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--lean-x', String(Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1))));
    el.style.setProperty('--lean-y', String(Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1))));
  }, []);
  const rest = () => { stage.current?.style.setProperty('--lean-x', '0'); stage.current?.style.setProperty('--lean-y', '0'); };

  const poke = () => {
    setIndex(value => (value + 1) % whispers.length);
    setBounce(value => value + 1);
    setBubble(true);
    try { navigator.vibrate?.(8); } catch {}
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBubble(false), 2400);
  };

  return <div className={styles.hero}>
    <div className={styles.glow} aria-hidden="true"><i /><i /></div>
    {stars.map((star, i) => <i key={i} className={styles.star} aria-hidden="true" style={{ left: star.x, top: star.y, width: star.s, height: star.s, animationDelay: star.d }} />)}
    <div ref={stage} className={styles.stage} onPointerMove={lean} onPointerLeave={rest}>
      <button type="button" className={styles.planet} onClick={poke} aria-label="和星球打个招呼">
        <span key={bounce} className={styles.bounce}><PlanetIllustration size="lg" /></span>
      </button>
      <span className={styles.bubble} data-show={bubble || undefined} role="status" aria-live="polite">{bubble ? whispers[index] : ''}</span>
    </div>
    <h1 className={styles.title}>Soul 星球</h1>
    <HomeGreeting />
  </div>;
}
