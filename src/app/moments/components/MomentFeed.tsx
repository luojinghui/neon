'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { observeMomentMasonry } from '../masonry';

type Props = {
  children: ReactNode;
};

export function MomentFeed({ children }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (feedRef.current) return observeMomentMasonry(feedRef.current);
  }, [children]);

  return <div ref={feedRef} className="moment-feed-grid">{children}</div>;
}
