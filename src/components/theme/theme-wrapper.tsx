'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { useLayoutEffect, useState } from 'react';
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import { BrowserThemeSync } from './browser-theme-sync';
import { StyleProvider } from '@ant-design/cssinjs';
import { hoverOnlyTransformer } from '@/styles/hover-policy';
import { ConfirmProvider } from '@/components/ui/confirm';

/** CSS is the only palette. Resolve colors before passing them to AntD's color algorithms. */
function readAntdTheme(root: HTMLElement): ThemeConfig {
  const computed = getComputedStyle(root);
  const value = (name: string) => computed.getPropertyValue(name).trim();
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.setAttribute('aria-hidden', 'true');
  root.appendChild(probe);

  const color = (name: string) => {
    const channels = value(name);
    if (!channels) return undefined;
    probe.style.removeProperty('color');
    probe.style.color = `hsl(${channels})`;
    return probe.style.color ? getComputedStyle(probe).color : undefined;
  };
  const fontSize = (name: string) => {
    const size = value(name);
    if (!size) return undefined;
    probe.style.removeProperty('font-size');
    probe.style.fontSize = size;
    return probe.style.fontSize ? parseFloat(getComputedStyle(probe).fontSize) : undefined;
  };
  const radius = (name: string) => {
    const size = value(name);
    if (!size) return undefined;
    probe.style.removeProperty('border-radius');
    probe.style.borderRadius = size;
    return probe.style.borderRadius ? parseFloat(getComputedStyle(probe).borderTopLeftRadius) : undefined;
  };
  const number = (name: string) => {
    const result = parseFloat(value(name));
    return Number.isFinite(result) ? result : undefined;
  };

  try {
    const modalRadius = radius('--radius-xl');
    const token: ThemeConfig['token'] = {
      colorPrimary: color('--primary'),
      colorPrimaryHover: color('--primary-hover'),
      colorPrimaryActive: color('--primary-hover'),
      colorPrimaryBg: color('--primary-soft'),
      colorTextLightSolid: color('--primary-foreground'),
      colorInfo: color('--info'),
      colorInfoBg: color('--info-soft'),
      colorSuccess: color('--success'),
      colorSuccessBg: color('--success-soft'),
      colorWarning: color('--warning'),
      colorWarningBg: color('--warning-soft'),
      colorError: color('--danger'),
      colorErrorBg: color('--danger-soft'),
      colorTextBase: color('--foreground'),
      colorText: color('--foreground'),
      colorTextHeading: color('--foreground'),
      colorTextSecondary: color('--foreground-secondary'),
      colorTextDescription: color('--foreground-secondary'),
      colorTextTertiary: color('--foreground-muted'),
      colorTextQuaternary: color('--foreground-muted'),
      colorTextPlaceholder: color('--foreground-muted'),
      colorBorder: color('--border'),
      colorBorderSecondary: color('--border'),
      colorSplit: color('--border'),
      colorBgBase: color('--background'),
      colorBgLayout: color('--background'),
      colorBgContainer: color('--surface'),
      colorBgElevated: color('--surface'),
      colorBgMask: color('--overlay'),
      colorBgTextHover: color('--surface-hover'),
      colorBgTextActive: color('--surface-active'),
      colorFillAlter: color('--surface-inset'),
      fontFamily: value('--font-sans') || undefined,
      fontSize: fontSize('--font-size-body'),
      fontSizeSM: fontSize('--font-size-caption'),
      fontSizeLG: fontSize('--font-size-body-lg'),
      fontSizeHeading1: fontSize('--font-size-display'),
      fontSizeHeading2: fontSize('--font-size-heading'),
      fontSizeHeading3: fontSize('--font-size-title'),
      fontSizeHeading4: fontSize('--font-size-body-lg'),
      fontSizeHeading5: fontSize('--font-size-body'),
      lineHeight: number('--line-height-body'),
      lineHeightSM: number('--line-height-caption'),
      lineHeightLG: number('--line-height-body-lg'),
      lineHeightHeading1: number('--line-height-display'),
      lineHeightHeading2: number('--line-height-heading'),
      lineHeightHeading3: number('--line-height-title'),
      lineHeightHeading4: number('--line-height-body-lg'),
      lineHeightHeading5: number('--line-height-body'),
      fontWeightStrong: number('--font-weight-semibold'),
      borderRadius: radius('--radius-md'),
      borderRadiusXS: radius('--radius-sm'),
      borderRadiusSM: radius('--radius-sm'),
      borderRadiusLG: radius('--radius-lg'),
      boxShadow: value('--shadow-lg') || undefined,
      boxShadowSecondary: value('--shadow-md') || undefined
    };
    return {
      algorithm: root.classList.contains('dark') ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      // An absent optional role should use AntD's default, not overwrite it with undefined.
      token: Object.fromEntries(Object.entries(token).filter(([, entry]) => entry !== undefined)),
      components: modalRadius === undefined ? undefined : { Modal: { borderRadiusLG: modalRadius } }
    };
  } finally {
    probe.remove();
  }
}

function AntdThemeSync({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [config, setConfig] = useState<ThemeConfig>({});

  useLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const next = readAntdTheme(root);
      setConfig(previous => previous.algorithm === next.algorithm
        && JSON.stringify(previous.token) === JSON.stringify(next.token)
        && JSON.stringify(previous.components) === JSON.stringify(next.components) ? previous : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-skin'] });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  return (
    <ConfigProvider theme={config}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ConfigProvider>
  );
}

export default function ClientThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserThemeSync />
      <StyleProvider transformers={[hoverOnlyTransformer]}><AntdThemeSync>{children}</AntdThemeSync></StyleProvider>
    </ThemeProvider>
  );
}
