import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';
import styles from './planet-illustration.module.css';

export type PlanetVariant = 'planet' | 'comet' | 'satellite';
export interface PlanetIllustrationProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant?: PlanetVariant;
  size?: 'sm' | 'md' | 'lg';
  /** Omit for a decorative illustration; provide only when the image conveys content. */
  label?: string;
}

/** Small, faceless Soul planets. Geometry is decorative content, not UI shape tokens. */
export function PlanetIllustration({ variant = 'planet', size = 'md', label, className, ...props }: PlanetIllustrationProps) {
  return <span {...props} className={cn(styles.illustration, styles[size], className)} data-planet={variant}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <span className={styles.scene}><span className={styles.tail} /><span className={styles.core} />
      <span className={styles.orbit} /><span className={styles.moon} /></span>
  </span>;
}
