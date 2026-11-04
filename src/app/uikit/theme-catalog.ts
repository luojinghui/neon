import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AnyNode } from 'postcss';

export type ThemeColorToken = {
  /** Original CSS custom property, including its leading --. */
  name: string;
  label: string;
  /** Chinese group label, ordered by the source theme. */
  group: string;
  scope: 'skin' | 'mode';
  /** Original formulas expose relationships without duplicating CSS values. */
  source: { light: string; dark: string };
  /** Resolved CSS colors, ready for backgroundColor or color. */
  light: string;
  dark: string;
};

export type ThemeTypographyToken = {
  name: string;
  role: string;
  label: string;
  usage: string;
  size: string;
  mobileSize: string;
  lineHeight: string;
  weight: string;
};

export type ThemeRadiusToken = {
  name: string;
  role: 'sm' | 'md' | 'lg' | 'xl';
  label: string;
  usage: string;
  /** CSS length read from the shared source, independent of skin and mode. */
  value: string;
};

type ColorPair = { light: string; dark: string };
export type ThemeCatalog = {
  colors: ThemeColorToken[];
  shadows: ThemeShadowToken[];
  typography: ThemeTypographyToken[];
  radii: ThemeRadiusToken[];
  skins: { name: string; label: string }[];
  palettes: Record<string, Record<string, ColorPair>>;
};

export type ThemeShadowToken = {
  name: string;
  label: string;
  group: string;
  /** Resolved CSS box-shadow values, including theme-specific alpha. */
  light: string;
  dark: string;
};

const labels: Record<string, string> = {
  primary: '主题主色', 'primary-foreground': '主色上的文字', 'primary-hover': '主色悬停', 'primary-soft': '主色浅背景',
  accent: '强调色', 'accent-foreground': '强调色上的文字', 'accent-soft': '强调色浅背景',
  background: '页面背景',
  foreground: '主要文字', 'foreground-secondary': '次要文字', 'foreground-muted': '弱化文字',
  surface: '基础表面', 'surface-hover': '表面悬停', 'surface-active': '表面激活', 'surface-inset': '内嵌表面',
  border: '默认边框', 'border-hover': '边框悬停', 'border-focus': '边框聚焦', ring: '键盘焦点环',
  success: '成功', 'success-soft': '成功浅背景', warning: '警告', 'warning-soft': '警告浅背景',
  danger: '危险', 'danger-soft': '危险浅背景', info: '信息', 'info-soft': '信息浅背景',
  'chat-bubble-self': '自己的聊天气泡', 'chat-bubble-self-foreground': '自己气泡的文字',
  'chat-bubble-other': '对方的聊天气泡', 'chat-bubble-other-foreground': '对方气泡的文字',
  'sidebar-active': '侧栏选中项', overlay: '遮罩',
  'shadow-color': '阴影基色', 'shadow-sm': '小阴影', 'shadow-md': '中阴影', 'shadow-lg': '大阴影', 'shadow-xl': '超大阴影', 'shadow-card': '卡片阴影'
};

const typographyRoles = [
  { role: 'caption', label: '提示', usage: '说明、时间、标签', weight: 'regular' },
  { role: 'body', label: '正文', usage: '正文、按钮、表单', weight: 'regular' },
  { role: 'body-lg', label: '阅读正文', usage: '长文、消息', weight: 'regular' },
  { role: 'title', label: '小标题', usage: '卡片标题、弹窗标题', weight: 'semibold' },
  { role: 'heading', label: '区块标题', usage: '分区、章节', weight: 'semibold' },
  { role: 'display', label: '页面标题', usage: '主标题、欢迎语', weight: 'semibold' }
];
const radiusRoles = [
  { role: 'sm', label: '小尺寸', usage: '标签、Tooltip、小按钮' },
  { role: 'md', label: '中尺寸', usage: '按钮、输入框、选择器' },
  { role: 'lg', label: '大尺寸', usage: '卡片、Popover、媒体' },
  { role: 'xl', label: '超大尺寸', usage: '弹窗、抽屉、面板' }
] as const;
const skinLabels: Record<string, string> = { orange: '暖橘', blue: '晴蓝', violet: '鸢紫' };
const skinSelector = /^\[data-skin=['"]?([\w-]+)['"]?\]$/;

function groupFor(name: string): string {
  if (/^--primary(?:-|$)/.test(name)) return '主色';
  if (/^--accent(?:-|$)/.test(name)) return '强调色';
  if (/^--background(?:-|$)/.test(name)) return '背景';
  if (/^--foreground(?:-|$)/.test(name)) return '文字';
  if (/^--surface(?:-|$)/.test(name)) return '表面';
  if (/^--border(?:-|$)/.test(name) || name === '--ring') return '边框与焦点';
  if (/^--(?:success|warning|danger|info)(?:-|$)/.test(name)) return '状态';
  if (/^--chat(?:-|$)/.test(name)) return '聊天';
  if (name === '--sidebar-active') return '侧栏';
  if (name === '--overlay' || /^--shadow(?:-|$)/.test(name)) return '遮罩与阴影';
  return '其他颜色';
}

/** Resolve aliases against each complete palette, so inherited aliases use dark overrides too. */
function resolver(values: Map<string, string>) {
  const cache = new Map<string, string>();
  const token = (name: string, ancestors: string[] = []): string | undefined => {
    if (cache.has(name)) return cache.get(name);
    const value = values.get(name);
    if (value === undefined) return undefined;
    if (ancestors.includes(name)) throw new Error(`Circular theme alias: ${[...ancestors, name].join(' → ')}`);
    const resolved = expand(value, [...ancestors, name]);
    cache.set(name, resolved);
    return resolved;
  };
  const expand = (value: string, ancestors: string[]): string => {
    // A balanced scan also supports var(--missing, var(--fallback)) and function fallbacks.
    let result = '';
    let cursor = 0;
    const variables = /var\(/g;
    let match: RegExpExecArray | null;
    while ((match = variables.exec(value))) {
      const start = match.index;
      let end = variables.lastIndex;
      let depth = 1;
      let comma = -1;
      for (; end < value.length; end += 1) {
        if (value[end] === '(') depth += 1;
        else if (value[end] === ')' && --depth === 0) break;
        else if (value[end] === ',' && depth === 1 && comma === -1) comma = end;
      }
      if (depth !== 0) throw new Error(`Unclosed theme alias: ${value}`);
      const name = value.slice(variables.lastIndex, comma === -1 ? end : comma).trim();
      const replacement = token(name, ancestors) ?? (comma === -1 ? undefined : expand(value.slice(comma + 1, end).trim(), ancestors));
      result += value.slice(cursor, start) + (replacement ?? value.slice(start, end + 1));
      cursor = end + 1;
      variables.lastIndex = cursor;
    }
    // Resolve the palette's numeric HSL offsets without evaluating arbitrary CSS.
    return (result + value.slice(cursor)).replace(
      /calc\(\s*([-+]?(?:\d*\.)?\d+)(%?)\s+([+-])\s+([-+]?(?:\d*\.)?\d+)(%?)\s*\)/g,
      (expression, left: string, leftUnit: string, operator: string, right: string, rightUnit: string) => {
        if (leftUnit !== rightUnit) return expression;
        const amount = operator === '+' ? Number(left) + Number(right) : Number(left) - Number(right);
        return `${Number(amount.toFixed(6))}${leftUnit}`;
      }
    ).replace(/\s+/g, ' ').trim();
  };
  return token;
}

const hslChannels = /^[-+]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)?\s+[-+]?(?:\d*\.)?\d+%\s+[-+]?(?:\d*\.)?\d+%(?:\s*\/\s*[-+]?(?:\d*\.)?\d+%?)?$/i;

function asColor(value: string | undefined): string | undefined {
  if (!value || value.includes('var(')) return undefined;
  if (hslChannels.test(value)) return `hsl(${value})`;
  // Accept complete CSS color functions too, should the source theme adopt them later.
  if (/^(?:hsl|hsla|rgb|rgba|hwb|lab|lch|oklab|oklch|color|color-mix)\([^;]+\)$/i.test(value) || /^#[\da-f]{3,8}$/i.test(value)) return value;
  return undefined;
}

/** Server-only source reader. All supported selectors have equal specificity. */
export function getThemeCatalog(): ThemeCatalog {
  const source = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8');
  const stylesheet = postcss.parse(source);
  const skinNames = new Set<string>();
  stylesheet.walkRules(rule => {
    for (const selector of rule.selectors) {
      const match = skinSelector.exec(selector);
      if (match) skinNames.add(match[1]);
    }
  });
  if (!skinNames.size) skinNames.add('orange');
  const skins = [...skinNames].map(name => ({ name, label: skinLabels[name] ?? name }));
  const readPalette = (mode: 'light' | 'dark', skin: string, mobile = false) => {
    const values = new Map<string, string>();
    stylesheet.walkRules(rule => {
      // Keep responsive overrides separate from the desktop catalog, including nested @layer rules.
      for (let ancestor: AnyNode | undefined = rule.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.type === 'atrule' && ancestor.name === 'media'
          && !(mobile && /^\(max-width:\s*640px\)$/.test(ancestor.params))) return;
      }
      // Evaluate each complete palette in source order. A shared alias rule can
      // match both :root and .dark; it must not erase earlier mode overrides.
      if (!rule.selectors.some(selector => selector === ':root' || selector === `.${mode}`
        || selector === '[data-skin]' || skinSelector.exec(selector)?.[1] === skin)) return;
      rule.each(node => {
        if (node.type === 'decl' && node.prop.startsWith('--')) values.set(node.prop, node.value);
      });
    });
    return values;
  };
  const root = readPalette('light', skins[0].name);
  const dark = readPalette('dark', skins[0].name);
  const lightValue = resolver(root);
  const darkValue = resolver(dark);
  const mobileValue = resolver(readPalette('light', skins[0].name, true));
  const followsSkin = (name: string, seen = new Set<string>()): boolean => {
    if (/^--(?:skin|primary|accent)(?:-|$)/.test(name) || name.startsWith('--chat-bubble-self')) return true;
    if (seen.has(name)) return false;
    const visited = new Set(seen).add(name);
    const definitions = `${root.get(name) ?? ''} ${dark.get(name) ?? ''}`;
    return [...definitions.matchAll(/var\((--[\w-]+)/g)].some(match => followsSkin(match[1], visited));
  };
  const colors: ThemeColorToken[] = [];
  const shadows: ThemeShadowToken[] = [];
  for (const name of new Set([...root.keys(), ...dark.keys()])) {
    if (/^--(?:skin|tone)-/.test(name)) continue;
    const light = lightValue(name);
    const night = darkValue(name);
    const lightColor = asColor(light);
    const darkColor = asColor(night);
    const metadata = { name, label: labels[name.slice(2)] ?? `自定义颜色（${name.slice(2)}）`, group: groupFor(name) };
    if (lightColor || darkColor) {
      // A token present in only one palette is still listed, using its available value.
      colors.push({
        ...metadata,
        scope: followsSkin(name) ? 'skin' : 'mode',
        source: { light: root.get(name) ?? dark.get(name)!, dark: dark.get(name) ?? root.get(name)! },
        light: lightColor ?? darkColor!, dark: darkColor ?? lightColor!
      });
    } else if (/^--shadow(?:-|$)/.test(name) && (light || night)) {
      shadows.push({ ...metadata, light: light ?? night!, dark: night ?? light! });
    }
  }
  const typography = typographyRoles.flatMap(({ role, label, usage, weight }) => {
    const name = `--font-size-${role}`;
    const size = lightValue(name);
    if (!size) return [];
    return [{ name, role, label, usage, size, mobileSize: mobileValue(name) ?? size, lineHeight: lightValue(`--line-height-${role}`) ?? 'normal', weight: lightValue(`--font-weight-${weight}`) ?? 'normal' }];
  });
  const radii = radiusRoles.flatMap(({ role, label, usage }) => {
    const name = `--radius-${role}`;
    const value = lightValue(name);
    return value ? [{ name, role, label, usage, value }] : [];
  });
  const palettes: ThemeCatalog['palettes'] = {};
  for (const skin of skins) {
    const light = resolver(readPalette('light', skin.name));
    const night = resolver(readPalette('dark', skin.name));
    palettes[skin.name] = Object.fromEntries(colors.map(color => [color.name, {
      light: asColor(light(color.name)) ?? color.light,
      dark: asColor(night(color.name)) ?? color.dark
    }]));
  }
  return { colors, shadows, typography, radii, skins, palettes };
}
