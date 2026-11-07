// Pre-hydration fallback for the default orange skin. BrowserThemeSync reads
// the actual CSS background after hydration, including the selected skin.
export const PWA_THEME_COLORS = {
  light: '#fbf9f7',
  dark: '#2c2926'
} as const;

export const PWA_NAME = 'Soul星球';

// Bump when replacing icon artwork so browsers request the new assets.
export const PWA_ICON_VERSION = '2';
