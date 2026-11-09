import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon } from './icon';
import { cn } from '@/utils/cn';
import styles from './display.module.css';

/** Semantic names map to theme tokens; legacy palette names are kept as aliases. */
const tagColors = {
  success: 'success', green: 'success',
  processing: 'processing', blue: 'processing',
  error: 'error', red: 'error',
  warning: 'warning', gold: 'warning',
  accent: 'accent', purple: 'accent',
  default: undefined
} as const;
export type TagColor = keyof typeof tagColors;

export interface TagProps extends HTMLAttributes<HTMLSpanElement> { color?: TagColor; icon?: ReactNode }
export function Tag({ color, icon, className, children, ...props }: TagProps) {
  return <span {...props} className={cn(styles.tag, className)} data-ui-tag="" data-color={color ? tagColors[color] : undefined}>{icon}{children}</span>;
}

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  count?: number;
  overflowCount?: number;
  dot?: boolean;
  showZero?: boolean;
  /** [x, y] nudge in px for the floating mark. */
  offset?: [number, number];
  children?: ReactNode;
}
/** Count or dot mark. Standalone without children; floats on the top-right corner of children. */
export function Badge({ count = 0, overflowCount = 99, dot, showZero, offset, children, className, style, ...props }: BadgeProps) {
  const visible = dot ? true : count > 0 || (showZero && count === 0);
  const mark = visible && <span className={styles.badgeMark} data-dot={dot || undefined} data-floating={children ? '' : undefined}
    style={children && offset ? { top: offset[1], right: -offset[0] } : undefined} role="status" aria-label={dot ? '有新内容' : `${count} 条未读`}>
    {dot ? null : count > overflowCount ? `${overflowCount}+` : count}</span>;
  if (!children) return <span {...props} className={className} style={style}>{mark}</span>;
  return <span {...props} className={cn(styles.badge, className)} style={style}>{children}{mark}</span>;
}

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  active?: boolean;
  title?: boolean;
  paragraph?: boolean | { rows?: number };
}
export function Skeleton({ active, title = true, paragraph = true, className, ...props }: SkeletonProps) {
  const rows = paragraph === false ? 0 : typeof paragraph === 'object' ? paragraph.rows ?? 3 : 3;
  return <div {...props} className={cn(styles.skeleton, className)} data-active={active || undefined} aria-busy="true" aria-live="polite">
    {title && <div className={styles.skeletonLine} data-title="" />}
    {Array.from({ length: rows }, (_, index) => <div key={index} className={styles.skeletonLine} style={index === rows - 1 && rows > 1 ? { width: '62%' } : undefined} />)}
  </div>;
}

const spinSizes = { small: 16, default: 20, large: 32 } as const;
export interface SpinProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: keyof typeof spinSizes;
  indicator?: ReactNode;
  /** When true, children are dimmed behind a centered spinner. */
  spinning?: boolean;
  children?: ReactNode;
}
export function Spin({ size = 'default', indicator, spinning = true, children, className, ...props }: SpinProps) {
  const node = <span {...props} className={cn(styles.spin, className)} role="status" aria-label="正在加载">{indicator ?? <Icon name="loading" size={spinSizes[size]} />}</span>;
  if (children === undefined) return spinning ? node : null;
  return <div className={styles.spinWrap}>{spinning && <div className={styles.spinMask}>{node}</div>}<div className={spinning ? styles.spinBlur : undefined}>{children}</div></div>;
}

export interface SpaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap in px or a CSS length. Default 8px. */
  size?: number | string;
  vertical?: boolean;
  wrap?: boolean;
  align?: 'center';
}
export function Space({ size = 8, vertical, wrap, align, className, style, ...props }: SpaceProps) {
  return <div {...props} className={cn(styles.space, className)} data-vertical={vertical || undefined} data-wrap={wrap || undefined} data-align={align}
    style={{ '--space-gap': typeof size === 'number' ? `${size}px` : size, ...style } as CSSProperties} />;
}
