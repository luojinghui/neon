import { cn } from '@/utils/cn';
import styles from './button.module.css';

export type ButtonVariant = 'outline' | 'ghost' | 'primary';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonFeedback = 'default' | 'none';
export type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  /** Keep ghost icon/count actions visually bare while preserving their normal hit area. */
  feedback?: ButtonFeedback;
  align?: 'center' | 'start';
  block?: boolean;
  className?: string;
};

/** Shared with navigation links, including those rendered on the server. */
export function buttonClassName({ variant = 'outline', size = 'md', iconOnly, feedback = 'default', align = 'center', block, className }: ButtonStyleProps = {}) {
  return cn(styles.button, styles[variant], styles[size], variant === 'ghost' && feedback === 'none' && styles.feedbackNone, iconOnly && styles.iconOnly, block && styles.block, align === 'start' && styles.alignStart, className);
}
