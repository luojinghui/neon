'use client';

import { useEffect, useState } from 'react';
import { useCurrentProfile } from '@/app/profile/useCurrentProfile';
import styles from './home-greeting.module.css';

function getGreeting(hour: number) {
  if (hour < 5 || hour >= 23) return { text: '夜深啦', emoji: '🌙' };
  if (hour < 11) return { text: '早上好', emoji: '👋' };
  if (hour < 14) return { text: '中午好', emoji: '👋' };
  if (hour < 18) return { text: '下午好', emoji: '👋' };
  return { text: '晚上好', emoji: '✨' };
}

export function HomeGreeting() {
  const profile = useCurrentProfile();
  const [greeting, setGreeting] = useState<ReturnType<typeof getGreeting> | null>(null);
  const name = profile?.name.trim();

  useEffect(() => {
    const updateGreeting = () => setGreeting(getGreeting(new Date().getHours()));
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateGreeting();
    };

    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className={styles.slot} aria-live="polite" aria-atomic="true">
      {name && greeting && (
        <p className={styles.greeting}>
          <span className={styles.salutation}>{greeting.text}，</span>
          <span className={styles.name} title={name}>{name}</span>
          <span key={greeting.emoji} className={`${styles.emoji} ${greeting.emoji === '👋' ? styles.wave : styles.sway}`} aria-hidden="true">{greeting.emoji}</span>
        </p>
      )}
    </div>
  );
}
