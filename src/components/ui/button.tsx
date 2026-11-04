'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './button.module.css';
import { Icon } from './icon';
import { buttonClassName, type ButtonStyleProps } from './button-styles';
export { buttonClassName, type ButtonVariant, type ButtonSize, type ButtonFeedback } from './button-styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  icon?: ReactNode;
  loading?: boolean;
}

/** All action buttons share these styles; className is for placement and layout. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'outline', size = 'md', icon, iconOnly, align, feedback = 'default',
  loading = false, block, className, children, disabled, type = 'button', ...props
}, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading}
    aria-busy={loading || undefined} data-ui-button="" data-variant={variant} data-size={size} data-align={align} data-feedback={feedback}
    className={buttonClassName({ variant, size, iconOnly: iconOnly ?? (!!icon && !children), align, feedback, block, className })}>
    {loading ? <Icon name="loading" size="sm" /> : icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
    {children}
  </button>;
});
