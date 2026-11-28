'use client';

import dynamic from 'next/dynamic';
import styles from './pool.module.css';

const PoolGame = dynamic(() => import('./PoolGame').then(module => module.PoolGame), {
  ssr: false,
  loading: () => <div className={styles.loading}>球台准备中</div>
});

export function PoolApp() {
  return (
    <div className={styles.page}>
      <PoolGame />
    </div>
  );
}
