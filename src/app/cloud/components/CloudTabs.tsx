'use client';

import { useSearchParams } from 'next/navigation';
import type { AnchorHTMLAttributes } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { CLOUD_PATH, PLAZA_PATH } from '../navigation';

/** Native history updates URL state without a server navigation or remounting editors. */
export function CloudLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self') || props.download) return;
    event.preventDefault();
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href);
  }} />;
}

export default function CloudTabs() {
  const params = useSearchParams();
  const isPlaza = params.get('tab') === 'plaza';
  return <Tabs aria-label="云传导航" className="cloud-tabs" size="md" activeKey={isPlaza ? 'plaza' : 'cloud'}
    items={[{ key: 'cloud', label: '云传', href: CLOUD_PATH }, { key: 'plaza', label: '广场', href: PLAZA_PATH }]}
    onNavigate={(href, event) => {
      event.preventDefault();
      if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href);
    }} />;
}
