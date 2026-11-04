'use client';

import { forwardRef, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Tooltip } from './tooltip';
import { Textarea, ClearIcon, type FieldClear, type FieldCount } from './textarea';
import { clearFormField, formClass, formSize, useFormValue, type FormSize } from './form-utils';
import styles from './form-controls.module.css';

export type InputRef = HTMLInputElement;
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: FormSize;
  prefix?: ReactNode;
  suffix?: ReactNode;
  allowClear?: FieldClear;
  showCount?: FieldCount;
  onClear?: () => void;
  status?: 'error' | 'warning';
  focusDecoration?: ReactNode;
  onPressEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputClassName?: string;
  variant?: 'outlined' | 'borderless' | 'filled' | 'underlined';
}

const BaseInput = forwardRef<HTMLInputElement, InputProps>(function Input({
  value, defaultValue, size = 'md', prefix, suffix, allowClear, showCount, status,
  focusDecoration, onPressEnter, className, inputClassName, style, disabled,
  onChange, onClear, onKeyDown, maxLength, variant: _variant, ...props
}, ref) {
  const node = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useFormValue(value, defaultValue ?? '');
  const text = String(current ?? '');
  useImperativeHandle(ref, () => node.current!, []);
  const count = Array.from(text).length;
  const counter = typeof showCount === 'object' && showCount.formatter
    ? showCount.formatter({ value: text, count, maxLength }) : `${count}${maxLength ? ` / ${maxLength}` : ''}`;
  return <span className={formClass(styles.field, className)} style={style} data-ui-input="" data-size={formSize(size)} data-disabled={String(!!disabled)} data-status={status}>
    {prefix != null && <span className={styles.affix}>{prefix}</span>}
    <input {...props} ref={node} className={formClass(styles.input, inputClassName)} value={current} disabled={disabled} maxLength={maxLength} aria-invalid={status === 'error' || props['aria-invalid'] || undefined}
      onChange={event => { setCurrent(event.target.value); onChange?.(event); }}
      onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'Enter' && !event.nativeEvent.isComposing) onPressEnter?.(event); }} />
    {allowClear && text && !disabled && !props.readOnly && <span className={styles.action}><Tooltip title="清空输入"><Button variant="ghost" data-ui-surface iconOnly size="sm" aria-label="清空输入" onMouseDown={event => event.preventDefault()} onClick={() => { if (node.current) { clearFormField(node.current, onChange); setCurrent(''); onClear?.(); node.current.focus(); } }}>{typeof allowClear === 'object' && allowClear.clearIcon ? allowClear.clearIcon : <ClearIcon />}</Button></Tooltip></span>}
    {showCount && <span className={styles.count} aria-live="off">{counter}</span>}
    {suffix != null && <span className={styles.affix}>{suffix}</span>}
    {focusDecoration && <span className={styles.decoration} aria-hidden="true">{focusDecoration}</span>}
  </span>;
});

export interface PasswordProps extends InputProps { visibilityToggle?: boolean; }
const Password = forwardRef<HTMLInputElement, PasswordProps>(function Password({ visibilityToggle = true, suffix, disabled, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return <BaseInput {...props} ref={ref} disabled={disabled} type={visible ? 'text' : 'password'} suffix={<>{suffix}{visibilityToggle && <span className={styles.action}><Tooltip title={visible ? '隐藏密码' : '显示密码'}><Button variant="ghost" data-ui-surface iconOnly size="sm" disabled={disabled} aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onMouseDown={event => event.preventDefault()} onClick={() => setVisible(value => !value)}><Icon name={visible ? 'eye' : 'eye-invisible'} /></Button></Tooltip></span>}</>} />;
});

export interface SearchProps extends InputProps {
  onSearch?: (value: string) => void;
  loading?: boolean;
  enterButton?: ReactNode;
}
const Search = forwardRef<HTMLInputElement, SearchProps>(function Search({ onSearch, loading, enterButton, suffix, onPressEnter, ...props }, ref) {
  const node = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => node.current!, []);
  return <BaseInput {...props} ref={node} onClear={() => { props.onClear?.(); if (!loading) onSearch?.(''); }} suffix={<>{suffix}<span className={styles.action}><Tooltip title={typeof enterButton === 'string' ? enterButton : '搜索'}><Button variant="ghost" data-ui-surface iconOnly size="sm" loading={loading} disabled={props.disabled} aria-label={typeof enterButton === 'string' ? enterButton : '搜索'} onClick={() => { if (!loading) onSearch?.(node.current?.value ?? ''); }}><Icon name="search" /></Button></Tooltip></span></>} onPressEnter={event => { onPressEnter?.(event); if (event.defaultPrevented) return; if (loading || onSearch) event.preventDefault(); if (!loading && !props.disabled) onSearch?.(event.currentTarget.value); }} />;
});

export const Input = Object.assign(BaseInput, { TextArea: Textarea, Password, Search });
