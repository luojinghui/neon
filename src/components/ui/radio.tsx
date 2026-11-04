'use client';

import { createContext, forwardRef, useContext, useId, type ChangeEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { formClass, formSize, useFormValue, type FormSize } from './form-utils';
import styles from './form-controls.module.css';

type RadioValue = string | number;
export type RadioAppearance = 'default' | 'card';
export type RadioChangeEvent<T extends RadioValue = RadioValue> = Omit<ChangeEvent<HTMLInputElement>, 'target'> & { target: EventTarget & Omit<HTMLInputElement, 'value'> & { value: T } };
interface RadioContextValue {
  value?: RadioValue;
  name: string;
  disabled?: boolean;
  appearance: RadioAppearance;
  indicator?: boolean;
  change: (value: RadioValue, event: ChangeEvent<HTMLInputElement>) => void;
}
const RadioContext = createContext<RadioContextValue | null>(null);
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: FormSize;
  appearance?: RadioAppearance;
  indicator?: boolean;
}
const BaseRadio = forwardRef<HTMLInputElement, RadioProps>(function Radio({ children, className, style, disabled, checked, defaultChecked, value = 'on', name, onChange, size = 'md', appearance, indicator, ...props }, ref) {
  const group = useContext(RadioContext);
  const isDisabled = disabled || group?.disabled;
  return <label className={formClass(styles.choice, className)} style={style} data-ui-radio="" data-indicator={String(indicator ?? group?.indicator ?? true)} data-appearance={appearance ?? group?.appearance ?? 'default'} data-size={formSize(size)} data-disabled={String(!!isDisabled)}>
    <input {...props} ref={ref} type="radio" className={styles.choiceInput} value={value} name={name ?? group?.name} checked={group ? group.value === value : checked} defaultChecked={group ? undefined : defaultChecked} disabled={isDisabled} onChange={event => { onChange?.(event); group?.change(value as RadioValue, event); }} />
    <span className={formClass(styles.choiceMark, styles.radioMark)} aria-hidden="true" />
    {children != null && <span>{children}</span>}
  </label>;
});
export interface RadioOption<T extends RadioValue = RadioValue> {
  label: ReactNode;
  value: T;
  disabled?: boolean;
  /** Structured supporting content for appearance="card". */
  description?: ReactNode;
  icon?: ReactNode;
}
export interface RadioGroupProps<T extends RadioValue = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: T;
  defaultValue?: T;
  onChange?: (event: RadioChangeEvent<T>) => void;
  options?: readonly (RadioOption<NoInfer<T>> | NoInfer<T>)[];
  disabled?: boolean;
  name?: string;
  appearance?: RadioAppearance;
  indicator?: boolean;
}
function RadioGroup<T extends RadioValue = string>({ value, defaultValue, onChange, options, disabled, name, appearance = 'default', indicator, children, className, ...props }: RadioGroupProps<T>) {
  const id = useId();
  const [current, setCurrent] = useFormValue(value, defaultValue);
  return <RadioContext.Provider value={{ value: current, disabled, appearance, indicator, name: name ?? `radio-${id}`, change: (next, event) => {
    setCurrent(next as T);
    const groupEvent = Object.create(event) as RadioChangeEvent<T>;
    Object.defineProperty(groupEvent, 'target', { value: { value: next, checked: event.target.checked, name: event.target.name, id: event.target.id } });
    onChange?.(groupEvent);
  } }}><div {...props} role="radiogroup" data-appearance={appearance} className={formClass(styles.group, className)} aria-disabled={disabled || undefined}>{options ? options.map((option, index) => {
    const item: RadioOption<NoInfer<T>> = typeof option === 'object' ? option : { value: option, label: option };
    const titleId = `${id}-option-${index}-title`;
    const descriptionId = `${id}-option-${index}-description`;
    return <BaseRadio key={item.value} value={item.value} disabled={item.disabled}
      aria-labelledby={appearance === 'card' ? titleId : undefined}
      aria-describedby={appearance === 'card' && item.description != null ? descriptionId : undefined}>
      {appearance === 'card' ? <span className={styles.radioCardContent}>
        {item.icon != null && <span className={styles.radioCardIcon} aria-hidden="true">{item.icon}</span>}
        <span className={styles.radioCardText}>
          <span id={titleId} className={styles.radioCardTitle}>{item.label}</span>
          {item.description != null && <span id={descriptionId} className={styles.radioCardDescription}>{item.description}</span>}
        </span>
      </span> : item.label}
    </BaseRadio>;
  }) : children}</div></RadioContext.Provider>;
}
export const Radio = Object.assign(BaseRadio, { Group: RadioGroup });
