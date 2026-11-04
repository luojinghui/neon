import Link from 'next/link';
import type { HTMLAttributes, HTMLAttributeAnchorTarget, ReactNode, Ref } from 'react';
import { cn } from '@/utils/cn';
import styles from './card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'article' | 'div' | 'section' | 'a' | 'link';
  href?: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  title?: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  cover?: ReactNode;
  footer?: ReactNode;
  padding?: 'none' | 'sm' | 'md';
  bodyClassName?: string;
  /** Preserve an existing direct-child layout (e.g. masonry cards and measured editors). */
  bodyWrap?: boolean;
  /** Share link-card feedback while keeping nested actions and container semantics. */
  interactive?: boolean;
  ref?: Ref<HTMLElement>;
}

/** Content cards remain non-interactive containers unless an explicit href is supplied.
 * Keep cards with nested controls as article/div/section and put navigation inside them. */
export function Card({ as, href, target, rel, title, description, extra, cover, footer, padding = 'md', bodyClassName, bodyWrap = true, interactive = false, ref, children, className, ...props }: CardProps) {
  const content = <>{cover != null && <div className={styles.cover}>{cover}</div>}
    {(title != null || description != null || extra != null) && <header className={styles.header}>
      <div className={styles.heading}>{title != null && <h3 className={styles.title}>{title}</h3>}
        {description != null && <div className={styles.description}>{description}</div>}</div>{extra}
    </header>}
    {children != null && (bodyWrap ? <div className={cn(styles.body, bodyClassName)}>{children}</div> : children)}
    {footer != null && <footer className={styles.footer}>{footer}</footer>}</>;
  const shared = { ...props, className: cn(styles.card, styles[padding], !bodyWrap && styles.unwrapped, href && styles.link, (href || interactive) && styles.interactive, className), 'data-ui-card': '' };
  if (href && (!as || as === 'link')) return <Link {...shared} ref={ref as Ref<HTMLAnchorElement>} href={href} target={target} rel={rel}>{content}</Link>;
  if (href && as === 'a') return <a {...shared} ref={ref as Ref<HTMLAnchorElement>} href={href} target={target} rel={rel}>{content}</a>;
  const Element = as === 'div' || as === 'section' ? as : 'article';
  return <Element {...shared} ref={ref as Ref<HTMLDivElement>}>{content}</Element>;
}
