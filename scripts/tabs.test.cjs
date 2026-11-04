const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  });
  vm.runInNewContext(outputText, { exports, require(name) {
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map(extension => base + extension).find(file => fs.existsSync(file));
      if (!resolved) throw new Error(`Cannot resolve ${name}`);
      return load(resolved);
    }
    return require(name);
  } }, { filename });
  return exports;
}
const { tabDragDirection, nearestTab, createTabClickGuard, tabDragScrollStep } = load(path.join(root, 'src/components/ui/tabs-gesture.ts'));
const { Tabs } = load(path.join(root, 'src/components/ui/tabs.tsx'));
const { Card } = load(path.join(root, 'src/components/ui/card.tsx'));
const { Button } = load(path.join(root, 'src/components/ui/button.tsx'));

test('vertical scrolling and tap jitter do not initiate horizontal tab dragging', () => {
  assert.equal(tabDragDirection(3, 4), 'pending');
  assert.equal(tabDragDirection(5, 20), 'vertical');
  assert.equal(tabDragDirection(-12, 3), 'horizontal');
});

test('dragging chooses enabled centers with unequal widths and at both edges', () => {
  const items = [{ key: 'first', left: 3, width: 50 }, { key: 'locked', left: 57, width: 70, disabled: true }, { key: 'last', left: 131, width: 120 }];
  assert.equal(nearestTab(items, -200).key, 'first');
  assert.equal(nearestTab(items, 80).key, 'first');
  assert.equal(nearestTab(items, 180).key, 'last');
  assert.equal(nearestTab(items, 900).key, 'last');
  assert.equal(nearestTab(items.map(item => ({ ...item, disabled: true })), 90), undefined);
});

test('overflowing tab drags scroll only near viewport edges, in physical directions for LTR and RTL', () => {
  assert.equal(tabDragScrollStep(180, 100, 160), 0, 'stationary in the middle');
  assert.equal(tabDragScrollStep(100, 100, 160), -8, 'left edge reveals content to the left');
  assert.equal(tabDragScrollStep(260, 100, 160), 8, 'right edge reveals content to the right');
  assert.equal(tabDragScrollStep(-200, 100, 160), -8, 'capture outside the viewport stays speed bounded');
  assert.equal(tabDragScrollStep(900, 100, 160), 8);
  assert.equal(tabDragScrollStep(105, 100, 20), 0, 'small tracks still have a central dead zone');
  assert.equal(tabDragScrollStep(100, 100, 0), 0, 'hidden viewport does not scroll');
});

test('only the post-drag pointer click is consumed; keyboard and immediate new taps remain usable', () => {
  const guard = createTabClickGuard();
  guard.afterDrag();
  assert.equal(guard.suppress(0), false, 'keyboard activation remains available');
  assert.equal(guard.suppress(1), true, 'consume the drag-generated click');
  assert.equal(guard.suppress(1), false, 'do not leave a timed click suppression window');
  guard.afterDrag();
  guard.pointerDown();
  assert.equal(guard.suppress(1), false, 'a new physical tap clears stale suppression after cancellation');
});

test('tab panels use stable key identities, preserve inactive content and skip disabled initial selection', () => {
  const html = renderToStaticMarkup(React.createElement(Tabs, { id: 'settings', defaultActiveKey: 'locked', items: [
    { key: 'locked', label: '锁定', disabled: true, children: '暂不可用' },
    { key: 'my info', label: '我的资料', children: '个人资料内容' }
  ] }));
  assert.match(html, /id="settings-tab-locked"[^>]*aria-selected="false"[^>]*disabled=""/);
  assert.match(html, /id="settings-tab-my%20info"[^>]*aria-selected="true"[^>]*aria-controls="settings-panel-1"/);
  assert.match(html, /id="settings-panel-0"[^>]*aria-labelledby="settings-tab-locked"[^>]*hidden=""/);
  assert.match(html, /id="settings-panel-1"[^>]*aria-labelledby="settings-tab-my%20info"/);
  assert.match(html, /个人资料内容/);
});

test('external panels are referenced while navigation retains actual link semantics', () => {
  const tabs = renderToStaticMarkup(React.createElement(Tabs, { panelId: 'existing-content', items: [{ key: 'one', label: '第一页' }] }));
  assert.match(tabs, /aria-controls="existing-content"/);
  const links = renderToStaticMarkup(React.createElement(Tabs, { activeKey: 'plaza', items: [
    { key: 'cloud', label: '云传', href: '/cloud' }, { key: 'plaza', label: '广场', href: '/cloud?tab=plaza' }
  ] }));
  assert.match(links, /role="navigation"/);
  assert.match(links, /href="\/cloud"/);
  assert.match(links, /href="\/cloud\?tab=plaza"[^>]*aria-current="page"/);
  assert.doesNotMatch(links, /role="tab"/);
});

test('content cards keep nested controls independent; links require an explicit href', () => {
  const html = renderToStaticMarkup(React.createElement(Card, { title: '星球', footer: React.createElement(Button, null, '管理') }, React.createElement(Button, null, '进入')));
  assert.match(html, /^<article/);
  assert.equal((html.match(/<button /g) || []).length, 2);
  assert.doesNotMatch(html, /<a /);
  const link = renderToStaticMarkup(React.createElement(Card, { href: '/soul', title: '前往星球' }));
  assert.match(link, /href="\/soul"/);
});

test('measured editors and masonry cards can preserve direct-child DOM without a body wrapper', () => {
  const html = renderToStaticMarkup(React.createElement(Card, { as: 'section', padding: 'none', bodyWrap: false, 'aria-labelledby': 'editor-title' },
    React.createElement('header', { id: 'editor-title' }, '发送内容'),
    React.createElement('div', { className: 'editor-surface' }, React.createElement('textarea', { defaultValue: '正文仍可编辑' }))));
  assert.match(html, /^<section[^>]*aria-labelledby="editor-title"[^>]*><header id="editor-title">/);
  assert.match(html, /<\/header><div class="editor-surface"><textarea>/);
  assert.doesNotMatch(html, /class="body/);
});
