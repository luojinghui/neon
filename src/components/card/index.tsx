'use client';

import Link from 'next/link';
import { ArrowRightOutlined } from '@ant-design/icons';
import { FC, type CSSProperties, type ReactNode } from 'react';
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

  return (
    <Link href={href} className={styles.card} style={style}>
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <ArrowRightOutlined className={styles.arrow} aria-hidden="true" />
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
    </Link>
  );
};
