'use client';

import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { formClass, formSize, useFormValue, type FormSize } from './form-utils';
import styles from './form-controls.module.css';
import { Icon } from './icon';

type ChoiceValue = string | number;
interface CheckboxContextValue {
  values: readonly ChoiceValue[];
  disabled?: boolean;
  name?: string;
  change: (value: ChoiceValue, checked: boolean) => void;
}
const CheckboxContext = createContext<CheckboxContextValue | null>(null);
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  indeterminate?: boolean;
  size?: FormSize;
}
const BaseCheckbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({
  children, className, style, indeterminate = false, disabled, checked, defaultChecked,
  onChange, value = 'on', name, size = 'md', ...props
}, ref) {
  const group = useContext(CheckboxContext);
  const node = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => node.current!, []);
  useEffect(() => { if (node.current) node.current.indeterminate = indeterminate; }, [indeterminate]);
  const isDisabled = disabled || group?.disabled;
  const isChecked = group ? group.values.includes(value as ChoiceValue) : checked;
  return <label className={formClass(styles.choice, className)} style={style} data-ui-checkbox="" data-size={formSize(size)} data-disabled={String(!!isDisabled)}>
    <input {...props} ref={node} type="checkbox" className={styles.choiceInput} value={value} name={name ?? group?.name} checked={isChecked} defaultChecked={group ? undefined : defaultChecked} disabled={isDisabled} aria-checked={indeterminate ? 'mixed' : isChecked} onChange={event => { onChange?.(event); group?.change(value as ChoiceValue, event.target.checked); }} />
    <span className={styles.choiceMark} aria-hidden="true"><Icon name={indeterminate ? 'minus' : 'check'} size="sm" /></span>
    {children != null && <span>{children}</span>}
  </label>;
});
export interface CheckboxOption<T extends ChoiceValue = ChoiceValue> { label: ReactNode; value: T; disabled?: boolean; }
export interface CheckboxGroupProps<T extends ChoiceValue = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: T[];
  defaultValue?: T[];
  onChange?: (values: T[]) => void;
  options?: readonly (CheckboxOption<T> | T)[];
  disabled?: boolean;
  name?: string;
}
function CheckboxGroup<T extends ChoiceValue = string>({ value, defaultValue = [], onChange, options, disabled, name, children, className, ...props }: CheckboxGroupProps<T>) {
  const [values, setValues] = useFormValue(value, defaultValue);
  return <CheckboxContext.Provider value={{ values, disabled, name, change: (item, checked) => {
    const next = checked ? [...values, item as T] : values.filter(value => value !== item);
    setValues(next); onChange?.(next);
  } }}><div {...props} role="group" className={formClass(styles.group, className)} aria-disabled={disabled || undefined}>{options ? options.map(option => {
    const item = typeof option === 'object' ? option : { value: option, label: option };
    return <BaseCheckbox key={item.value} value={item.value} disabled={item.disabled}>{item.label}</BaseCheckbox>;
  }) : children}</div></CheckboxContext.Provider>;
}
export const Checkbox = Object.assign(BaseCheckbox, { Group: CheckboxGroup });
