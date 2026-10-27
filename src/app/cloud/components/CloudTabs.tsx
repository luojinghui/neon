'use client';

import { useSearchParams } from 'next/navigation';
import type { AnchorHTMLAttributes } from 'react';
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
  return <nav aria-label="云传导航" className="cloud-tabs">
    <CloudLink href={CLOUD_PATH} aria-current={!isPlaza ? 'page' : undefined} className={!isPlaza ? 'is-active' : ''}>云传</CloudLink>
    <CloudLink href={PLAZA_PATH} aria-current={isPlaza ? 'page' : undefined} className={isPlaza ? 'is-active' : ''}>广场</CloudLink>
  </nav>;
}
