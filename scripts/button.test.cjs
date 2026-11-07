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
const { Button } = load(path.join(root, 'src/components/ui/button.tsx'));

test('buttons inside forms require an explicit submit type', () => {
  const html = renderToStaticMarkup(React.createElement('form', null,
    React.createElement(Button, null, '取消'), React.createElement(Button, { type: 'submit' }, '保存')));
  assert.match(html, /type="button"[^>]*>取消/);
  assert.match(html, /type="submit"[^>]*>保存/);
});

test('loading actions cannot submit twice and keep their accessible label', () => {
  const html = renderToStaticMarkup(React.createElement(Button, { loading: true, 'aria-label': '保存设置' }, '保存'));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="保存设置"/);
  assert.match(html, />保存<\/button>/);
});

test('disabled and icon-only controls retain native semantics', () => {
  const html = renderToStaticMarkup(React.createElement(Button, { disabled: true, icon: React.createElement('svg'), 'aria-label': '复制内容', title: '复制内容' }));
  assert.match(html, /^<button/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-label="复制内容"/);
  assert.doesNotMatch(html, /ant-btn/);
});

test('site controls use UIKit buttons and overlays instead of Ant Design implementations', () => {
  const failures = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      const normalizedFilename = filename.split(path.sep).join('/');
      if (entry.isDirectory()) { walk(filename); continue; }
      if (!/\.tsx?$/.test(filename) || filename.endsWith('.d.ts')) continue;
      const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      function visit(node) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'antd') {
          const bindings = node.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const item of bindings.elements) {
              const name = (item.propertyName || item.name).text;
              if (['Button', 'Popover', 'Tooltip', 'Popconfirm', 'Modal', 'Alert', 'Switch', 'Checkbox', 'Radio', 'Input', 'Select', 'Card', 'Tabs'].includes(name)) failures.push(`${filename}: imports Ant Design ${name}`);
            }
          }
        }
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'button' && !normalizedFilename.endsWith('/ui/button.tsx')) failures.push(`${filename}: defines a separate native button`);
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !normalizedFilename.includes('/components/ui/')) {
          const tag = node.tagName.getText(source);
          const type = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'type');
          const nativeType = type?.initializer && ts.isStringLiteral(type.initializer) ? type.initializer.text : 'text';
          if (tag === 'textarea' || tag === 'select' || (tag === 'input' && !['file', 'range', 'color', 'hidden'].includes(nativeType))) failures.push(`${filename}: bypasses UIKit ${tag}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  walk(path.join(root, 'src'));
  assert.deepEqual(failures, []);
});


test('the icon catalog renders every registered glyph and decorative icons do not duplicate action labels', () => {
  const { Icon, iconNames } = load(path.join(root, 'src/components/ui/icon.tsx'));
  for (const name of iconNames) {
    const html = renderToStaticMarkup(React.createElement(Icon, { name }));
    assert.match(html, /aria-hidden="true"/, name);
    assert.match(html, /<svg/, name);
  }
  const meaningful = renderToStaticMarkup(React.createElement(Icon, { name: 'loading', label: '正在上传' }));
  assert.match(meaningful, /role="img" aria-label="正在上传"/);
  assert.match(meaningful, /data-spin="true"/);
  const like = renderToStaticMarkup(React.createElement(Icon, { name: 'heart', active: true }));
  assert.match(like, /data-ui-icon="heart"[^>]*data-active="true"/);
});
