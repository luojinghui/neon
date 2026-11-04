'use client';

/**
 * 将触发器实际使用的网站主题变量同步到 Portal 的继承容器。
 * 不复制组件状态、Tailwind 计算变量或其他项目的主题属性。
 */
import { useLayoutEffect } from 'react';

/** 仅列出 src/styles/index.css 中的主题变量名，颜色始终由 CSS 级联解析。 */
const THEME_PROPERTIES = [
  '--primary', '--primary-foreground', '--primary-hover', '--primary-soft',
  '--accent', '--accent-foreground', '--accent-soft',
  '--background',
  '--foreground', '--foreground-secondary', '--foreground-muted',
  '--surface', '--surface-hover', '--surface-active', '--surface-inset',
  '--border', '--border-hover', '--border-focus', '--ring',
  '--success', '--success-soft', '--warning', '--warning-soft',
  '--danger', '--danger-soft', '--info', '--info-soft',
  '--chat-bubble-self', '--chat-bubble-self-foreground', '--chat-bubble-other', '--chat-bubble-other-foreground',
  '--overlay', '--shadow-color', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-card',
  '--sidebar-active',
  '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--font-sans',
  '--font-size-caption', '--font-size-body', '--font-size-body-lg',
  '--font-size-title', '--font-size-heading', '--font-size-display',
  '--line-height-caption', '--line-height-body', '--line-height-body-lg',
  '--line-height-title', '--line-height-heading', '--line-height-display',
  '--font-weight-regular', '--font-weight-medium', '--font-weight-semibold'
];

/**
 * 订阅触发器到文档根节点的主题变化；Portal 自身的显式变量仍按正常 CSS 级联生效。
 */
export function usePopoverTheme(
  trigger: HTMLElement | null,
  popup: HTMLElement | null,
  present: boolean
): void {
  useLayoutEffect(() => {
    if (!present || !trigger || !popup) return;

    const win = trigger.ownerDocument.defaultView;
    if (!win) return;

    const protectedProperties = new Set<string>();
    for (let index = 0; index < popup.style.length; index += 1) {
      const property = popup.style.item(index);
      if (property.startsWith('--')) protectedProperties.add(property);
    }

    const copiedValues = new Map<string, string>();
    let ownsColorScheme = !popup.style.getPropertyValue('color-scheme');
    let copiedColorScheme: string | null = null;
    const stillOwnsColorScheme = () => popup.style.getPropertyValue('color-scheme') === copiedColorScheme
      && !popup.style.getPropertyPriority('color-scheme');
    const syncTheme = () => {
      const computed = win.getComputedStyle(trigger);
      for (const property of THEME_PROPERTIES) {
        if (protectedProperties.has(property)) continue;
        const value = computed.getPropertyValue(property);
        if (value) popup.style.setProperty(property, value);
        else popup.style.removeProperty(property);
        copiedValues.set(property, value);
      }
      // Native fields in a locally light/dark popup need the trigger's browser scheme too.
      // Stop owning the property if a caller replaces our inline value after opening.
      if (ownsColorScheme && copiedColorScheme !== null && !stillOwnsColorScheme()) ownsColorScheme = false;
      if (ownsColorScheme) {
        copiedColorScheme = computed.colorScheme;
        popup.style.setProperty('color-scheme', copiedColorScheme);
      }
    };

    syncTheme();
    const observer = new win.MutationObserver(syncTheme);
    for (let ancestor: Element | null = trigger; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor === popup) continue;
      observer.observe(ancestor, { attributes: true, attributeFilter: ['style', 'class', 'data-skin'] });
    }

    return () => {
      observer.disconnect();
      for (const [property, value] of copiedValues) {
        if (popup.style.getPropertyValue(property) === value) popup.style.removeProperty(property);
      }
      if (ownsColorScheme && copiedColorScheme !== null && stillOwnsColorScheme()) popup.style.removeProperty('color-scheme');
    };
  }, [trigger, popup, present]);
}
