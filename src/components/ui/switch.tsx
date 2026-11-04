'use client';

import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { formClass, formSize, useFormValue, type FormSize } from './form-utils';
import styles from './form-controls.module.css';
import { Icon } from './icon';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'onChange'> {
  size?: FormSize;
  loading?: boolean;
  checkedChildren?: ReactNode;
  unCheckedChildren?: ReactNode;
  onChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
}
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch({ checked, defaultChecked = false, onChange, disabled, loading, size = 'md', checkedChildren, unCheckedChildren, className, style, ...props }, ref) {
  const [current, setCurrent] = useFormValue(checked, defaultChecked);
  return <label className={formClass(styles.switch, className)} style={style} data-ui-switch="" data-size={formSize(size)} data-disabled={String(!!disabled || !!loading)}>
    <input {...props} ref={ref} className={styles.choiceInput} type="checkbox" role="switch" checked={current} disabled={disabled || loading} aria-checked={current} aria-busy={loading || undefined} onChange={event => { setCurrent(event.target.checked); onChange?.(event.target.checked, event); }} />
    <span className={styles.switchTrack} aria-hidden="true">{current ? checkedChildren : unCheckedChildren}</span>
    {loading && <span className={styles.spinner} aria-hidden="true"><Icon name="loading" size={12} /></span>}
  </label>;
});
