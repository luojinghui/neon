'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Tooltip } from './tooltip';
import { clearFormField, formClass, formSize, useFormValue, type FormSize } from './form-utils';
import styles from './form-controls.module.css';

export type TextAreaRef = HTMLTextAreaElement;
export type FieldCount = boolean | { formatter?: (info: { value: string; count: number; maxLength?: number }) => ReactNode };
export type FieldClear = boolean | { clearIcon?: ReactNode };
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FormSize;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  allowClear?: FieldClear;
  showCount?: FieldCount;
  onClear?: () => void;
  status?: 'error' | 'warning';
  focusDecoration?: ReactNode;
  onPressEnter?: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'];
  /** Editable-element layout hook; className and style belong to the field container. */
  inputClassName?: string;
  variant?: 'outlined' | 'borderless' | 'filled' | 'underlined';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function Textarea({
  value, defaultValue, size = 'md', autoSize = false, allowClear, showCount, status,
  focusDecoration, onPressEnter, className, inputClassName, style, disabled,
  rows = 3, onChange, onClear, onKeyDown, maxLength, variant: _variant, ...props
}, ref) {
  const node = useRef<HTMLTextAreaElement>(null);
  const [current, setCurrent] = useFormValue(value, defaultValue ?? '');
  const text = String(current ?? '');
  useImperativeHandle(ref, () => node.current!, []);
  const minRows = typeof autoSize === 'object' ? autoSize.minRows ?? rows : rows;
  const maxRows = typeof autoSize === 'object' ? autoSize.maxRows : undefined;

  useLayoutEffect(() => {
    const textarea = node.current;
    if (!textarea || !autoSize) return;
    const resize = () => {
      const computed = getComputedStyle(textarea);
      const line = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.5;
      const padding = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom);
      const border = Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
      const min = Math.max(1, minRows) * line + padding + border;
      const max = maxRows ? Math.max(minRows, maxRows) * line + padding + border : Infinity;
      textarea.style.height = '0px';
      const needed = textarea.scrollHeight + border;
      textarea.style.height = `${Math.min(max, Math.max(min, needed))}px`;
      textarea.style.overflowY = needed > max ? 'auto' : 'hidden';
    };
    resize();
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth !== width) { width = textarea.clientWidth; resize(); }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [text, autoSize, minRows, maxRows]);

  const count = Array.from(text).length;
  const counter = typeof showCount === 'object' && showCount.formatter
    ? showCount.formatter({ value: text, count, maxLength }) : `${count}${maxLength ? ` / ${maxLength}` : ''}`;
  return <span className={formClass(styles.field, styles.textareaField, className)} style={style} data-ui-textarea="" data-size={formSize(size)} data-disabled={String(!!disabled)} data-status={status}>
    <textarea {...props} ref={node} className={formClass(styles.textarea, inputClassName)} value={current} rows={rows} maxLength={maxLength} disabled={disabled} aria-invalid={status === 'error' || props['aria-invalid'] || undefined} data-autosize={String(!!autoSize)}
      onChange={event => { setCurrent(event.target.value); onChange?.(event); }}
      onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'Enter' && !event.nativeEvent.isComposing) onPressEnter?.(event); }} />
    {(showCount || (allowClear && text && !disabled && !props.readOnly)) && <span className={styles.textareaFooter}>
      {allowClear && text && !disabled && !props.readOnly && <span className={styles.action}><Tooltip title="清空内容"><Button variant="ghost" data-ui-surface iconOnly size="sm" aria-label="清空内容" onMouseDown={event => event.preventDefault()} onClick={() => { if (node.current) { clearFormField(node.current, onChange); setCurrent(''); onClear?.(); node.current.focus(); } }}>{typeof allowClear === 'object' && allowClear.clearIcon ? allowClear.clearIcon : <ClearIcon />}</Button></Tooltip></span>}
      {showCount && <span className={styles.count} aria-live="off">{counter}</span>}
    </span>}
    {focusDecoration && <span className={styles.decoration} aria-hidden="true">{focusDecoration}</span>}
  </span>;
});

export function ClearIcon() {
  return <Icon name="close" />;
}
export { Textarea as TextArea };
