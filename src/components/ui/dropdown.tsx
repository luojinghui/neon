'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { Popover } from './popover';
import { Menu } from './menu';
import type { XYPopoverPlacement, XYPopoverTrigger } from './popover/index.type';

export interface DropdownItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export interface DropdownProps {
  items: DropdownItem[];
  trigger?: XYPopoverTrigger[];
  placement?: XYPopoverPlacement;
  children: ReactElement;
}

/** Action menu anchored to its child; closes after an item is chosen. */
export function Dropdown({ items, trigger = ['click'], placement = 'bottomRight', children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen} trigger={trigger} placement={placement}
    content={<Menu>{items.map(item => <Menu.Item key={item.key} icon={item.icon} label={item.label} disabled={item.disabled} tone={item.danger ? 'danger' : 'default'}
      onClick={() => { setOpen(false); item.onClick?.(); }} />)}</Menu>}>{children}</Popover>;
}
