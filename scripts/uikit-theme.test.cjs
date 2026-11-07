const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const project = path.resolve(__dirname, '..');
const theme = fs.readFileSync(path.join(project, 'src/styles/index.css'), 'utf8');
const source = fs.readFileSync(path.join(project, 'src/app/uikit/theme-catalog.ts'), 'utf8');

function catalog(css = theme) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  vm.runInNewContext(outputText, {
    exports,
    process: { cwd: () => project },
    require: name => name === 'node:fs' ? { readFileSync: filename => { assert.equal(filename, path.join(project, 'src/styles/index.css')); return css; } } : require(name)
  });
  return exports.getThemeCatalog();
}

test('the catalog separates semantic colors, typography and radii from skin parameters', () => {
  const { colors, shadows, typography, radii, skins, palettes } = catalog();
  assert.equal(colors.length, 34, 'only the semantic palette is public');
  assert.equal(shadows.length, 5);
  assert.deepEqual(Array.from(skins, item => item.name), ['orange', 'blue', 'violet', 'green', 'rose']);
  for (const item of colors) {
    assert.match(item.light, /^hsl\(.+\)$/);
    assert.match(item.dark, /^hsl\(.+\)$/);
    assert.ok(item.label && item.group && item.source.light && item.source.dark);
    assert.ok(!item.light.includes('var(') && !item.dark.includes('var('));
    assert.ok(['skin', 'mode'].includes(item.scope));
    for (const skin of skins) {
      assert.ok(palettes[skin.name][item.name]);
      if (item.scope === 'mode') assert.deepEqual(palettes[skin.name][item.name], palettes.orange[item.name], `${item.name} must stay stable across skins`);
    }
  }
  for (const item of shadows) assert.ok(!item.light.includes('var(') && !item.dark.includes('var('));
  assert.equal(colors.some(item => /^--(?:font|line|skin|tone|app|radius)-/.test(item.name)), false);
  assert.deepEqual(Array.from(radii, item => item.role), ['sm', 'md', 'lg', 'xl']);
  assert.ok(radii.every(item => item.name === `--radius-${item.role}` && item.label && item.usage));
  assert.deepEqual(Array.from(typography, item => item.role), ['caption', 'body', 'body-lg', 'title', 'heading', 'display']);
  for (const item of typography) {
    assert.match(item.size, /^[.\d]+rem$/);
    assert.ok(Number(item.lineHeight) >= 1.2);
    assert.ok([400, 500, 600].includes(Number(item.weight)));
  }
});

test('shared semantic roles resolve consistently in every palette', () => {
  const { colors, shadows, skins, palettes } = catalog();
  const color = name => colors.find(item => item.name === name);
  for (const skin of skins) {
    const values = palettes[skin.name];
    for (const [alias, target] of [
      ['--chat-bubble-other-foreground', '--foreground'], ['--border-focus', '--ring']
    ]) assert.deepEqual(values[alias], values[target], `${skin.name}: ${alias} aliases ${target}`);
  }
  assert.notEqual(palettes.orange['--primary'].light, palettes.blue['--primary'].light);
  assert.notEqual(palettes.blue['--primary'].dark, palettes.violet['--primary'].dark);
  assert.match(color('--overlay').light, /\/ 0\.35\)$/);
  assert.match(color('--overlay').dark, /\/ 0\.55\)$/);
  assert.ok(shadows.find(item => item.name === '--shadow-card').light.includes(color('--shadow-color').light.slice(4, -1)));
});

test('the default orange skin keeps its softened palette in both modes', () => {
  const { palettes } = catalog();
  const expected = {
    '--background': ['34 33% 97.5%', '28 8% 16%'],
    '--primary': ['23 78% 60%', '23 68% 64%'],
    '--primary-hover': ['23 78% 53%', '23 68% 71%'],
    '--primary-soft': ['27 74% 95%', '23 30% 22%'],
    '--primary-foreground': ['0 0% 100%', '0 0% 100%'],
    '--accent': ['8 62% 64%', '8 48% 67%'],
    '--accent-soft': ['8 55% 95%', '8 24% 22%'],
    '--accent-foreground': ['0 0% 100%', '0 0% 100%'],
    '--ring': ['23 72% 58%', '23 68% 58%'],
    '--border-focus': ['23 72% 58%', '23 68% 58%'],
    '--chat-bubble-self': ['26 70% 93%', '23 28% 28%'],
    '--chat-bubble-self-foreground': ['23 55% 30%', '0 0% 100%'],
    '--sidebar-active': ['23 72% 56%', '23 68% 60%']
  };
  // Hue is immaterial for achromatic white; the scoped formula retains the skin's hue.
  const normalize = color => color.replace(/^hsl\([\d.]+ 0% 100%\)$/, 'hsl(0 0% 100%)');
  for (const [name, values] of Object.entries(expected)) {
    for (const [index, mode] of ['light', 'dark'].entries()) {
      assert.equal(normalize(palettes.orange[name][mode]), `hsl(${values[index]})`, `${mode}: ${name}`);
    }
  }
});

test('page background follows each skin while preserving mode depth and neutral controls', () => {
  const { colors, palettes } = catalog();
  assert.equal(colors.find(color => color.name === '--background').scope, 'skin');
  const hues = { orange: [34, 28], blue: [229, 223], violet: [273, 267], green: [171, 165], rose: [353, 347] };
  for (const [skin, [lightHue, darkHue]] of Object.entries(hues)) {
    assert.equal(palettes[skin]['--background'].light, `hsl(${lightHue} 33% 97.5%)`);
    assert.equal(palettes[skin]['--background'].dark, `hsl(${darkHue} 8% 16%)`);
    for (const name of ['--foreground', '--surface', '--surface-inset', '--border']) {
      assert.deepEqual(palettes[skin][name], palettes.orange[name], `${skin}: ${name} stays neutral`);
    }
  }
});

test('dark page and neutral planes remain distinct and readable across skins', () => {
  const { palettes } = catalog();
  const luminance = value => {
    const channels = value.match(/^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/);
    assert.ok(channels, `expected opaque HSL: ${value}`);
    const h = Number(channels[1]) / 60, s = Number(channels[2]) / 100, l = Number(channels[3]) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s, x = chroma * (1 - Math.abs(h % 2 - 1)), m = l - chroma / 2;
    const rgb = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return rgb.reduce((sum, channel, index) => {
      const v = channel + m;
      return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
    }, 0);
  };
  const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  for (const [skin, values] of Object.entries(palettes)) {
    const level = name => luminance(values[`--${name}`].dark);
    const planes = ['background', 'surface', 'surface-inset'].map(level);
    // Hue shifts slightly change luminance at the same 16% HSL lightness.
    // Even the darkest channel at 8% saturation is sRGB .1472 (linear .0189).
    assert.ok(planes[0] >= .0189, `${skin}: page stays above near-black`);
    for (let index = 1; index < planes.length; index += 1) {
      assert.ok(planes[index] > planes[index - 1], `${skin}: each plane is lighter`);
      assert.ok(contrast(planes[index], planes[index - 1]) >= 1.25, `${skin}: adjacent planes remain visibly distinct`);
    }
    for (const plane of ['background', 'surface', 'surface-inset', 'surface-hover', 'surface-active']) {
      assert.ok(contrast(level('foreground'), level(plane)) >= 4.5, `${skin}: body text on ${plane}`);
    }
    for (const text of ['foreground-secondary', 'foreground-muted']) {
      assert.ok(contrast(level(text), planes[2]) >= 4.5, `${skin}: ${text} on input surface`);
    }
  }
});

test('shared scope declarations preserve mode overrides and recompute skin-derived aliases', () => {
  const { palettes, typography } = catalog(`
    :root, .light { --tone-solid: 40%; --foreground: 0 0% 10%; --font-size-caption: .75rem; --line-height-caption: 1.5; --font-weight-regular: 400; }
    .dark { --tone-solid: 70%; --foreground: 0 0% 90%; }
    :root, [data-skin='orange'] { --skin-primary-hue: 24; --skin-primary-saturation: 80%; }
    [data-skin='blue'] { --skin-primary-hue: 220; --skin-primary-saturation: 75%; }
    :root, .light, .dark, [data-skin] {
      --primary: var(--skin-primary-hue) var(--skin-primary-saturation) var(--tone-solid);
      --ring: var(--primary); --border-focus: var(--ring); --chat-bubble-other-foreground: var(--foreground);
    }
  `);
  assert.deepEqual({ ...palettes.orange['--ring'] }, { light: 'hsl(24 80% 40%)', dark: 'hsl(24 80% 70%)' });
  assert.deepEqual({ ...palettes.blue['--border-focus'] }, { light: 'hsl(220 75% 40%)', dark: 'hsl(220 75% 70%)' });
  assert.deepEqual({ ...palettes.blue['--chat-bubble-other-foreground'] }, { light: 'hsl(0 0% 10%)', dark: 'hsl(0 0% 90%)' });
  assert.equal(typography[0].size, '.75rem');
});

test('new color tokens, chained aliases, inherited dark aliases and nested fallbacks are included without metadata changes', () => {
  const { colors, shadows } = catalog(`:root {
    --primary: 12 40% 50%; --new-color: var(--primary); --new-alias: var(--new-color);
    --overlay: var(--new-alias) / 25%; --fallback-color: var(--absent, var(--new-alias));
    --shadow-new: 0 2px 3px hsl(var(--new-alias) / .2);
    --radius-md: 12px; --app-font: sans-serif; --app-width: calc(100% - 2rem);
  } .dark { --primary: 22 50% 60%; --only-dark: 30 60% 70%; }`);
  const color = name => colors.find(item => item.name === name);
  assert.equal(color('--new-alias').light, 'hsl(12 40% 50%)');
  assert.equal(color('--new-alias').dark, 'hsl(22 50% 60%)');
  assert.equal(color('--overlay').dark, 'hsl(22 50% 60% / 25%)');
  assert.equal(color('--fallback-color').dark, color('--new-alias').dark);
  assert.equal(color('--new-color').group, '其他颜色');
  assert.equal(color('--only-dark').light, color('--only-dark').dark);
  assert.equal(shadows[0].dark, '0 2px 3px hsl(22 50% 60% / .2)');
  assert.equal(colors.length, 6);
});

test('circular aliases fail explicitly instead of silently dropping theme colors', () => {
  assert.throws(() => catalog(':root { --one: var(--two); --two: var(--one); }'), /Circular theme alias/);
});

// These names are retired APIs. Check all consumers, not just the declarations,
// because a dangling var() or Tailwind class silently loses styling in the browser.
test('retired compatibility colors cannot be declared or consumed again', () => {
  const retired = [
    'background-secondary', 'background-tertiary', 'canvas', 'surface-raised',
    'sidebar', 'sidebar-foreground', 'sidebar-border', 'input', 'input-foreground',
    'input-placeholder', 'input-focus', 'control-placeholder',
    'segmented-background', 'segmented-selected', 'segmented-hover'
  ];
  const tokenPattern = new RegExp(`--(?:${retired.join('|')})(?![\\w-])`, 'g');
  const utilityPattern = new RegExp(`(?:^|[^\\w-])(?:bg|text|border|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|accent|caret)-(?:${[...retired, 'background-canvas'].join('|')})(?![\\w-])`, 'g');
  const files = [path.join(project, 'tailwind.config.ts')];
  const collect = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(name);
      else if (/\.(?:css|tsx?|jsx?)$/.test(entry.name)) files.push(name);
    }
  };
  collect(path.join(project, 'src'));
  for (const filename of files) {
    const contents = fs.readFileSync(filename, 'utf8');
    assert.deepEqual(contents.match(tokenPattern) ?? [], [], `retired variable in ${path.relative(project, filename)}`);
    assert.deepEqual(contents.match(utilityPattern) ?? [], [], `retired utility in ${path.relative(project, filename)}`);
  }
});

test('radius previews read the shared CSS scale rather than a second set of values', () => {
  const { radii } = catalog(`:root {
    --radius-sm: 0.25rem; --radius-md: 9px; --radius-lg: 18px; --radius-xl: 2rem;
    --primary: 24 85% 58%;
  } .dark { --primary: 24 80% 62%; }`);
  assert.deepEqual(Array.from(radii, item => [item.name, item.value]), [
    ['--radius-sm', '0.25rem'], ['--radius-md', '9px'], ['--radius-lg', '18px'], ['--radius-xl', '2rem']
  ]);
});


test('mobile titles compact independently while reading and input text keep their roles', () => {
  const { typography } = catalog();
  const token = role => typography.find(item => item.role === role);
  assert.equal(token('body').size, '0.875rem');
  assert.equal(token('body').mobileSize, token('body').size);
  assert.equal(token('body-lg').mobileSize, '1rem');
  assert.equal(token('caption').mobileSize, '0.75rem');
  assert.deepEqual(Array.from(typography.filter(item => ['title', 'heading', 'display'].includes(item.role)), item => [item.size, item.mobileSize]), [
    ['1.125rem', '1rem'], ['1.5rem', '1.25rem'], ['2rem', '1.75rem']
  ]);
});
