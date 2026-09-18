'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

const ROW_GAP = 20;

export function MomentFeed({ children }: Props) {
  const feedRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const items = Array.from(feed.children).filter((item): item is HTMLElement => item instanceof HTMLElement);
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      // Read natural heights together before changing any grid placement.
      const spans = items.map((item) => Math.ceil(item.getBoundingClientRect().height + ROW_GAP));
      items.forEach((item, index) => {
        const placement = `span ${spans[index]}`;
        if (item.style.gridRowEnd !== placement) item.style.gridRowEnd = placement;
      });
      feed.dataset.masonry = 'ready';
    };

    const scheduleMeasure = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    // Keep the SSR grid until every item has a span, then enable the 1px rows.
    measure();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    items.forEach((item) => observer?.observe(item));
    feed.addEventListener('load', scheduleMeasure, true);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      observer?.disconnect();
      feed.removeEventListener('load', scheduleMeasure, true);
      window.removeEventListener('resize', scheduleMeasure);
      if (frame !== null) window.cancelAnimationFrame(frame);
      delete feed.dataset.masonry;
      items.forEach((item) => item.style.removeProperty('grid-row-end'));
    };
  }, [children]);

  return <div ref={feedRef} className="moment-feed-grid">{children}</div>;
}
