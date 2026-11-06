'use client';

import { Icon } from '@/components/ui/icon';
import { FC, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Card as UICard } from '@/components/ui/card';
import styles from './card.module.css';

interface CardProps {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  tone?: 'primary' | 'info' | 'accent' | 'success';
}

export const Card: FC<CardProps> = ({ title, description, href, icon, tone = 'primary' }) => {
  const style = {
    '--card-color': `var(--${tone})`,
    '--card-soft': `var(--${tone}-soft)`
  } as CSSProperties;

  const spot = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <UICard href={href} padding="none" bodyWrap={false} className={styles.card} style={style} onPointerMove={spot}>
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <Icon name="arrow-right" className={styles.arrow} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
    </UICard>
  );
};
