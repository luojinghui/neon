'use client';

import { useState, type ChangeEvent, type ChangeEventHandler } from 'react';

export type FormSize = 'sm' | 'md' | 'lg' | 'small' | 'middle' | 'large';
export const formSize = (size: FormSize = 'md'): 'sm' | 'md' | 'lg' => ({ sm: 'sm', md: 'md', lg: 'lg', small: 'sm', middle: 'md', large: 'lg' } as const)[size];
export const formClass = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ');

export function useFormValue<T>(value: T | undefined, defaultValue: T) {
  const [internal, setInternal] = useState(defaultValue);
  return [value === undefined ? internal : value, (next: T) => { setInternal(next); }] as const;
}

/** Clear actions keep the real editable element as event.target, as native changes do. */
export function clearFormField<T extends HTMLInputElement | HTMLTextAreaElement>(node: T, onChange?: ChangeEventHandler<T>) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set;
  if (setter) setter.call(node, ''); else node.value = '';
  const event = new Event('change', { bubbles: true });
  Object.defineProperties(event, { target: { value: node }, currentTarget: { value: node } });
  onChange?.(event as unknown as ChangeEvent<T>);
}
