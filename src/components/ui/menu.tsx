import Link from 'next/link';
import { Button } from './button';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import styles from './menu.module.css';

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  /** Right-aligned content, e.g. an arrow, a value or a badge. */
  trailing?: ReactNode;
  tone?: 'default' | 'danger';
  /** Renders a real link when supplied. */
  href?: string;
}

/** A single row: icon tile, label, optional description and trailing slot. */
export function MenuItem({ icon, label, description, trailing, tone = 'default', href, className, disabled, type = 'button', ...props }: MenuItemProps) {
  const content = <>
    {icon != null && <span className={styles.icon} aria-hidden="true">{icon}</span>}
    <span className={styles.text}><span className={styles.label}>{label}</span>{description != null && <span className={styles.description}>{description}</span>}</span>
    {trailing != null && <span className={styles.trailing}>{trailing}</span>}
  </>;
  if (href) return <Link href={href} className={cn(styles.item, className)} data-tone={tone} data-ui-button="" aria-disabled={disabled || undefined}
    onClick={props.onClick as unknown as undefined}>{content}</Link>;
  return <Button {...props} variant="ghost" data-ui-surface="" type={type} disabled={disabled} className={cn(styles.item, className)} data-tone={tone}>{content}</Button>;
}

export function MenuSection({ title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { title?: ReactNode }) {
  return <div {...props} className={cn(styles.section, className)} role="group">{title != null && <div className={styles.title}>{title}</div>}{children}</div>;
}

/** Shared list for popover menus and settings sheets. Compose MenuSection and MenuItem. */
export function Menu({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn(styles.menu, className)}>{children}</div>;
}
Menu.Section = MenuSection;
Menu.Item = MenuItem;
