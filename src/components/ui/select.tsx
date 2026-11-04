'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Popover } from './popover';
import { ClearIcon } from './textarea';
import { formClass, formSize, useFormValue, type FormSize } from './form-utils';
import fieldStyles from './form-controls.module.css';
import styles from './select-controls.module.css';

export type SelectPrimitive = string | number;
export type SelectValue = SelectPrimitive | SelectPrimitive[];
export interface SelectOption { value: SelectPrimitive; label: ReactNode; disabled?: boolean; title?: string; }
export type SelectChangeValue<TValue extends SelectValue, TClear extends boolean> = TValue extends SelectPrimitive[] ? TValue : TClear extends true ? TValue | undefined : TValue;
export interface SelectProps<TValue extends SelectValue = string, TClear extends boolean = false> extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'onSelect'> {
  value?: TValue;
  defaultValue?: TValue;
  options?: readonly SelectOption[];
  onChange?: (value: SelectChangeValue<TValue, TClear>, option: SelectOption | SelectOption[] | undefined) => void;
  onSelect?: (value: SelectPrimitive, option: SelectOption) => void;
  mode?: 'multiple' | 'tags';
  size?: FormSize;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: TClear;
  placeholder?: ReactNode;
  showSearch?: boolean;
  searchValue?: string;
  onSearch?: (value: string) => void;
  optionFilterProp?: 'value' | 'label';
  filterOption?: boolean | ((input: string, option: SelectOption) => boolean);
  notFoundContent?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDropdownVisibleChange?: (open: boolean) => void;
  status?: 'error' | 'warning';
  focusDecoration?: ReactNode;
  name?: string;
  required?: boolean;
  autoFocus?: boolean;
  /** Popup layout may be adjusted without overriding component colors or interaction. */
  popupStyle?: CSSProperties;
}

function optionText(label: ReactNode): string {
  if (typeof label === 'string' || typeof label === 'number') return String(label);
  if (Array.isArray(label)) return label.map(optionText).join('');
  if (label && typeof label === 'object' && 'props' in label) return optionText((label.props as { children?: ReactNode }).children);
  return '';
}

/** Searchable combobox. DOM focus stays on its trigger while the listbox is portalled. */
export function Select<TValue extends SelectValue = string, TClear extends boolean = false>({
  value, defaultValue, options = [], onChange, onSelect, mode, size = 'md', disabled,
  loading, allowClear, placeholder = '请选择', showSearch, searchValue, onSearch,
  optionFilterProp = 'value', filterOption = true, notFoundContent = '暂时没有匹配选项',
  open, defaultOpen = false, onOpenChange, onDropdownVisibleChange, status,
  focusDecoration, name, required, autoFocus, popupStyle, className, style,
  id: suppliedId, onKeyDown, ...props
}: SelectProps<TValue, TClear>) {
  const generatedId = useId();
  const id = suppliedId ?? `select-${generatedId}`;
  const listId = `${id}-listbox`;
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useFormValue(value, defaultValue);
  const [isOpen, setIsOpen] = useFormValue(open, defaultOpen);
  const [search, setSearch] = useFormValue(searchValue, '');
  const [validationError, setValidationError] = useState(false);
  const nativeSelect = useRef<HTMLSelectElement>(null);
  const typeahead = useRef({ value: '', at: 0 });
  const [active, setActive] = useState(-1);
  const [width, setWidth] = useState(200);
  const multiple = !!mode;
  const searchable = showSearch ?? multiple;
  const selected: SelectPrimitive[] = current === undefined ? [] : Array.isArray(current) ? current : [current];
  const selectedOptions = selected.map(value => options.find(option => option.value === value) ?? { value, label: String(value) });
  const visibleOptions = options.filter(option => !search || !searchable || filterOption === false || (typeof filterOption === 'function'
    ? filterOption(search, option) : optionText(option[optionFilterProp]).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const unavailable = !!disabled || !!loading;
  const label = props['aria-label'] ?? (typeof placeholder === 'string' ? placeholder : '选择选项');
  const activeOption = active >= 0 ? visibleOptions[active] : undefined;
  const requestOpen = (next: boolean) => {
    if ((unavailable && next) || next === isOpen) return;
    setIsOpen(next); onOpenChange?.(next); onDropdownVisibleChange?.(next);
    if (next) {
      const selectedIndex = visibleOptions.findIndex(option => selected.includes(option.value) && !option.disabled);
      setActive(selectedIndex >= 0 ? selectedIndex : visibleOptions.findIndex(option => !option.disabled));
    } else { setSearch(''); }
  };
  const changeSearch = (next: string) => { setSearch(next); onSearch?.(next); };
  const change = (next: SelectPrimitive | SelectPrimitive[] | undefined) => {
    setCurrent(next as TValue); setValidationError(false);
    const matched = Array.isArray(next) ? next.map(value => options.find(option => option.value === value) ?? { value, label: String(value) }) : options.find(option => option.value === next);
    onChange?.(next as SelectChangeValue<TValue, TClear>, matched);
  };
  const choose = (option: SelectOption) => {
    if (unavailable || option.disabled) return;
    if (multiple) change(selected.includes(option.value) ? selected.filter(value => value !== option.value) : [...selected, option.value]);
    else { change(option.value); requestOpen(false); }
    onSelect?.(option.value, option);
    changeSearch('');
    (searchable ? searchInput.current : trigger.current)?.focus();
  };
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const form = nativeSelect.current?.form;
    const reset = () => { if (value === undefined) { setCurrent(defaultValue); setSearch(''); setValidationError(false); } };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [value, defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(visibleOptions.findIndex(option => !option.disabled)); }, [search, options]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (unavailable && isOpen) requestOpen(false); }, [unavailable]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoFocus) (searchable ? searchInput.current : trigger.current)?.focus();
  }, [autoFocus, searchable]);
  useEffect(() => {
    if (isOpen && activeOption) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, active, listId, activeOption]);
  const moveActive = (direction: number) => {
    if (!visibleOptions.length) return;
    let next = active;
    for (let i = 0; i < visibleOptions.length; i++) {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next].disabled) { setActive(next); return; }
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || unavailable || event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) requestOpen(true); else moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if ((event.key === 'Home' || event.key === 'End') && isOpen) {
      event.preventDefault();
      const indexes = visibleOptions.map((option, i) => option.disabled ? -1 : i).filter(i => i >= 0);
      setActive(event.key === 'Home' ? indexes[0] ?? -1 : indexes[indexes.length - 1] ?? -1);
    } else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault();
      if (!isOpen) requestOpen(true);
      else if (activeOption) choose(activeOption);
      else if (mode === 'tags' && search.trim()) choose({ value: search.trim(), label: search.trim() });
    } else if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); requestOpen(false); }
    else if (event.key === 'Tab') requestOpen(false);
    else if (event.key === 'Backspace' && multiple && !search && selected.length) change(selected.slice(0, -1));
    else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const prefix = `${now - typeahead.current.at < 600 ? typeahead.current.value : ''}${event.key}`.toLocaleLowerCase();
      typeahead.current = { value: prefix, at: now };
      const match = visibleOptions.findIndex(option => !option.disabled && optionText(option.label).toLocaleLowerCase().startsWith(prefix));
      if (match >= 0) { if (!isOpen) requestOpen(true); setActive(match); }
    }
  };
  const comboboxAria = {
    id, role: 'combobox', 'aria-expanded': !!isOpen, 'aria-controls': listId,
    'aria-haspopup': 'listbox' as const, 'aria-activedescendant': isOpen && activeOption ? `${listId}-${active}` : undefined,
    'aria-label': label, 'aria-labelledby': props['aria-labelledby'], 'aria-describedby': [props['aria-describedby'], validationError && `${id}-error`].filter(Boolean).join(' ') || undefined,
    'aria-busy': loading || undefined, 'aria-required': required || undefined, 'aria-invalid': status === 'error' || validationError || props['aria-invalid'] || undefined,
  };
  const popup = <div className={styles.popup} style={popupStyle}>
    <div id={listId} className={styles.list} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined}>
      {visibleOptions.map((option, index) => <div key={option.value} className={styles.option} data-active={String(index === active)} data-selected={String(selected.includes(option.value))} data-disabled={String(!!option.disabled)}>
        <Button variant="ghost" data-ui-surface role="option" id={`${listId}-${index}`} tabIndex={-1} aria-selected={selected.includes(option.value)} aria-disabled={option.disabled || undefined} disabled={option.disabled} onMouseDown={event => event.preventDefault()} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(option)}>
          <span className={styles.optionContent}><span>{option.label}</span>{selected.includes(option.value) && <Icon name="check" />}</span>
        </Button>
      </div>)}
      {!visibleOptions.length && <div className={styles.empty} role="status">{notFoundContent}</div>}
    </div>
  </div>;
  return <Popover open={isOpen && !unavailable} onOpenChange={requestOpen} trigger={[]} placement="bottomLeft" arrow={false} width={Math.max(width, 160)} role="presentation" bodyStyle={{ padding: 0 }} content={popup}>
    <div {...props} id={`${id}-field`} ref={root} className={formClass(fieldStyles.field, styles.select, className)} style={style} data-ui-select="" data-size={formSize(size)} data-disabled={String(unavailable)} data-status={validationError ? 'error' : status} onKeyDown={handleKeyDown}
      onBlur={event => { props.onBlur?.(event); if (!event.currentTarget.contains(event.relatedTarget)) requestOpen(false); }}
      onClick={event => { props.onClick?.(event); if (unavailable) return; if (searchable && !(event.target as HTMLElement).closest('button')) { searchInput.current?.focus(); if (!isOpen) requestOpen(true); } }}>
      <div className={styles.values}>
        {multiple && selectedOptions.map(option => <span key={option.value} className={styles.tag}><span>{option.label}</span>{!unavailable && <span className={styles.remove}><Button data-ui-surface variant="ghost" iconOnly size="sm" aria-label={`移除 ${optionText(option.label)}`} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); change(selected.filter(value => value !== option.value)); }}><ClearIcon /></Button></span>}</span>)}
        {searchable ? <>
          {!multiple && !search && selectedOptions.length > 0 && <span className={styles.singleValue}>{selectedOptions[0].label}</span>}
          <input {...comboboxAria} ref={searchInput} className={styles.search} value={search} disabled={unavailable} autoComplete="off" aria-autocomplete="list" placeholder={selected.length ? '' : typeof placeholder === 'string' ? placeholder : undefined}
            style={!multiple && selectedOptions.length && !search ? { width: '100%', position: 'absolute', inset: 0 } : undefined}
            onChange={event => { changeSearch(event.target.value); if (!isOpen) requestOpen(true); setActive(visibleOptions.findIndex(option => !option.disabled)); }} onFocus={() => { if (!isOpen) requestOpen(true); }} />
        </> : <Button {...comboboxAria} ref={trigger} variant="ghost" data-ui-surface disabled={unavailable} className={styles.trigger} onClick={() => requestOpen(!isOpen)}><span className={selectedOptions.length ? styles.singleValue : styles.placeholder}>{selectedOptions[0]?.label ?? placeholder}</span></Button>}
      </div>
      {allowClear && selected.length > 0 && !unavailable && <span className={fieldStyles.action}><Button variant="ghost" data-ui-surface iconOnly size="sm" aria-label="清空选择" onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); change(multiple ? [] : undefined); }}><ClearIcon /></Button></span>}
      <span className={styles.arrow} aria-hidden="true">{loading ? <Icon name="loading" size="sm" /> : <Icon name="down" />}</span>
      {focusDecoration && <span className={fieldStyles.decoration} aria-hidden="true">{focusDecoration}</span>}
      <select ref={nativeSelect} className={styles.native} name={name} required={required} disabled={unavailable} multiple={multiple} aria-hidden="true" tabIndex={-1} value={multiple ? selected.map(String) : selected[0] === undefined ? '' : String(selected[0])}
        onFocus={() => (searchable ? searchInput.current : trigger.current)?.focus()}
        onInvalid={event => { event.preventDefault(); setValidationError(true); (searchable ? searchInput.current : trigger.current)?.focus(); requestOpen(true); }}
        onChange={event => { const values = Array.from(event.target.selectedOptions, item => options.find(option => String(option.value) === item.value)?.value ?? item.value); change(multiple ? values : values[0]); }}>
        {!multiple && <option value="" disabled>{typeof placeholder === 'string' ? placeholder : '请选择'}</option>}
        {[...options, ...selectedOptions.filter(option => !options.some(item => item.value === option.value))].map(option => <option key={option.value} value={String(option.value)} disabled={option.disabled}>{optionText(option.label)}</option>)}
      </select>
      {validationError && <span id={`${id}-error`} className={styles.validation} role="alert">请选择一项{typeof label === 'string' ? `：${label}` : ''}</span>}
    </div>
  </Popover>;
}
