'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

type EditorLayout = {
  minRows: number;
  maxRows: number;
  viewportHeight: number;
  viewportTop: number;
  compact: boolean;
};

const initialLayout: EditorLayout = { minRows: 4, maxRows: 12, viewportHeight: 800, viewportTop: 0, compact: false };
const pixels = (value: string) => Number.parseFloat(value) || 0;

function outerHeight(element: HTMLElement | null): number {
  if (!element || !element.getClientRects().length) return 0;
  const style = getComputedStyle(element);
  return element.getBoundingClientRect().height + pixels(style.marginTop) + pixels(style.marginBottom);
}

/** Budget the writing surface from stable page chrome, independently of its current text height. */
export function useEditorLayout(panelRef: RefObject<HTMLElement | null>): EditorLayout {
  const [layout, setLayout] = useState(initialLayout);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const main = panel.closest<HTMLElement>('main.content');
    const heading = panel.querySelector<HTMLElement>('.cloud-editor-heading');
    const surface = panel.querySelector<HTMLElement>('.cloud-editor-surface');
    const attachments = panel.querySelector<HTMLElement>('.cloud-editor-attachments');
    const toolbar = panel.querySelector<HTMLElement>('.cloud-editor-toolbar');
    const textarea = surface?.querySelector('textarea');
    const viewport = window.visualViewport;
    let measureFrame = 0;
    let revealFrame = 0;
    let panelWidth = -1;
    let panelVisible = false;

    const revealToolbar = () => {
      if (!main || !toolbar || !textarea || document.activeElement !== textarea || !panel.getClientRects().length) return;
      const height = viewport?.height ?? window.innerHeight;
      if (height > 560) return;
      const visibleBottom = Math.min((viewport?.offsetTop ?? 0) + height, main.getBoundingClientRect().bottom) - 8;
      const overflow = toolbar.getBoundingClientRect().bottom - visibleBottom;
      if (overflow > 1) main.scrollTop += Math.ceil(overflow);
    };

    const measure = () => {
      measureFrame = 0;
      const viewportHeight = Math.max(1, Math.floor(viewport?.height ?? window.innerHeight));
      const viewportTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
      // Mobile keyboards can shrink only the visual viewport. Shrink the page's scroll
      // container too, so even a one-row editor can scroll its actions above the keyboard.
      const bodyStyle = getComputedStyle(document.body);
      panel.closest<HTMLElement>('.cloud-page')?.style.setProperty('--cloud-editor-viewport-height', `${viewportTop + viewportHeight - pixels(bodyStyle.paddingTop) - pixels(bodyStyle.paddingBottom)}px`);
      // Keep the shared page height current even when both editors are hidden by a
      // shared card. Only the editor's row budget is retained while display:none.
      if (!main || !surface || !textarea || !panel.getClientRects().length || panel.getBoundingClientRect().width <= 0) return;
      const mainStyle = getComputedStyle(main);
      const panelStyle = getComputedStyle(panel);
      const surfaceStyle = getComputedStyle(surface);
      const textStyle = getComputedStyle(textarea);
      // main's padding marks the first editor's original position, even after the feed scrolls.
      const contentTop = main.getBoundingClientRect().top + pixels(mainStyle.paddingTop);
      const visibleBottom = Math.min(viewportTop + viewportHeight, main.getBoundingClientRect().bottom);
      const available = visibleBottom - Math.max(viewportTop, contentTop) - 12;
      const panelInsets = pixels(panelStyle.paddingTop) + pixels(panelStyle.paddingBottom)
        + pixels(panelStyle.borderTopWidth) + pixels(panelStyle.borderBottomWidth);
      const surfaceInsets = pixels(surfaceStyle.paddingTop) + pixels(surfaceStyle.paddingBottom)
        + pixels(surfaceStyle.borderTopWidth) + pixels(surfaceStyle.borderBottomWidth)
        + pixels(surfaceStyle.marginTop) + pixels(surfaceStyle.marginBottom);
      const chrome = panelInsets + surfaceInsets + outerHeight(heading) + outerHeight(attachments) + outerHeight(toolbar);
      const textInsets = pixels(textStyle.paddingTop) + pixels(textStyle.paddingBottom)
        + pixels(textStyle.borderTopWidth) + pixels(textStyle.borderBottomWidth);
      // rc-textarea measures an integer scrollHeight for its single-row sizing textarea.
      const rowHeight = Math.max(1, Math.ceil(pixels(textStyle.lineHeight) || pixels(textStyle.fontSize) * 1.75 || 25));
      const textBudget = Math.min(viewportHeight * 0.6, available - chrome);
      const maxRows = Math.max(1, Math.floor((textBudget - textInsets) / rowHeight));
      const next: EditorLayout = { minRows: Math.min(4, maxRows), maxRows, viewportHeight, viewportTop, compact: viewportHeight <= 560 };
      setLayout(previous => Object.keys(next).every(key => previous[key as keyof EditorLayout] === next[key as keyof EditorLayout]) ? previous : next);

      // Allow React and rc-textarea to finish their row measurement before checking the keyboard edge.
      cancelAnimationFrame(revealFrame);
      revealFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(revealToolbar);
      });
    };

    const schedule = () => {
      if (!measureFrame) measureFrame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        if (entry.target === panel) {
          const width = entry.contentRect.width;
          const visible = width > 0 && entry.contentRect.height > 0;
          if (width !== panelWidth || visible !== panelVisible) changed = true;
          panelWidth = width;
          panelVisible = visible;
        } else {
          changed = true;
        }
      }
      // Text growth changes the panel's height only; it must not feed back into the row cap.
      if (changed) schedule();
    });
    observer.observe(panel);
    for (const element of [heading, toolbar, attachments]) if (element) observer.observe(element);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    panel.addEventListener('focusin', schedule);
    measure();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(revealFrame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      panel.removeEventListener('focusin', schedule);
    };
  }, [panelRef]);

  return layout;
}
