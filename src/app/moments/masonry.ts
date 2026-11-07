/** Keep cards in publication/keyboard order while packing their natural heights. */
export function observeMomentMasonry(feed: HTMLElement) {
  const items = Array.from(feed.children).filter((item): item is HTMLElement => item instanceof HTMLElement);
  let frame: number | null = null;
  let active = true;

  const clearPlacement = () => {
    delete feed.dataset.masonry;
    items.forEach((item) => item.style.removeProperty('grid-row-end'));
  };

  const measure = () => {
    frame = null;
    if (!active) return;
    const style = getComputedStyle(feed);
    // Follow the actual CSS columns, including when returning from a phone viewport.
    if (style.gridTemplateColumns.trim().split(/\s+/).length < 2) {
      clearPlacement();
      return;
    }

    // The column gap stays available after masonry replaces the row gap with spans.
    const gap = parseFloat(style.columnGap) || 0;
    const spans = items.map((item) => Math.ceil(item.getBoundingClientRect().height + gap));
    // Read all natural heights before writing any placement, avoiding layout thrashing.
    items.forEach((item, index) => {
      const placement = `span ${Math.max(1, spans[index])}`;
      if (item.style.gridRowEnd !== placement) item.style.gridRowEnd = placement;
    });
    feed.dataset.masonry = 'ready';
  };

  const scheduleMeasure = () => {
    if (active && frame === null) frame = window.requestAnimationFrame(measure);
  };

  measure();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
  observer?.observe(feed);
  items.forEach((item) => observer?.observe(item));
  feed.addEventListener('load', scheduleMeasure, true);
  feed.addEventListener('loadedmetadata', scheduleMeasure, true);
  window.addEventListener('resize', scheduleMeasure);

  return () => {
    active = false;
    observer?.disconnect();
    feed.removeEventListener('load', scheduleMeasure, true);
    feed.removeEventListener('loadedmetadata', scheduleMeasure, true);
    window.removeEventListener('resize', scheduleMeasure);
    if (frame !== null) window.cancelAnimationFrame(frame);
    clearPlacement();
  };
}
