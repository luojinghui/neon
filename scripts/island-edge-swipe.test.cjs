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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022
    }
  });
  vm.runInNewContext(
    outputText,
    {
      exports,
      require(name) {
        if (name.endsWith('.css')) {
          return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
        }
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/')
            ? path.join(root, 'src', name.slice(2))
            : path.resolve(path.dirname(filename), name);
          const resolved = ['.ts', '.tsx', '/index.ts', '/index.tsx']
            .map((extension) => base + extension)
            .find((file) => fs.existsSync(file));
          if (!resolved) throw new Error(`Cannot resolve ${name}`);
          return load(resolved);
        }
        return require(name);
      }
    },
    { filename }
  );
  return exports;
}

const guardPath = path.join(root, 'src/app/island/[islandId]/edgeSwipeGuard.ts');
const componentPath = path.join(root, 'src/app/island/[islandId]/components/IslandEdgeSwipeGuard.tsx');
const cssPath = path.join(root, 'src/app/island/[islandId]/island-canvas.module.css');
const pagePath = path.join(root, 'src/app/island/[islandId]/page.tsx');

function createTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn, options) {
      listeners.set(type, { fn, options });
    },
    removeEventListener(type, fn, capture) {
      const current = listeners.get(type);
      if (current && current.fn === fn && Boolean(current.options?.capture) === Boolean(capture)) {
        listeners.delete(type);
      }
    }
  };
}

test('edge strips claim touchstart and touchmove before the browser can go back', () => {
  const { attachEdgeSwipeBlock } = load(guardPath);
  const target = createTarget();
  const cleanup = attachEdgeSwipeBlock(target);

  for (const type of ['touchstart', 'touchmove']) {
    const listener = target.listeners.get(type);
    assert.ok(listener, `${type} listener missing`);
    assert.equal(listener.options.passive, false);
    assert.equal(listener.options.capture, true);
    let prevented = false;
    listener.fn({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }

  cleanup();
  assert.equal(target.listeners.size, 0);
});

test('horizontal overscroll lock is page-scoped and restores the previous value', () => {
  const { holdHorizontalOverscrollLock } = load(guardPath);
  const rootStyle = { style: { overscrollBehaviorX: 'contain' } };
  const release = holdHorizontalOverscrollLock(rootStyle);
  assert.equal(rootStyle.style.overscrollBehaviorX, 'none');
  release();
  assert.equal(rootStyle.style.overscrollBehaviorX, 'contain');
});

test('island detail renders a left and right edge guard below the top bar', () => {
  const { IslandEdgeSwipeGuard } = load(componentPath);
  const html = renderToStaticMarkup(React.createElement(IslandEdgeSwipeGuard));
  assert.match(html, /data-side="left"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-side="left"/);
  assert.match(html, /data-side="right"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-side="right"/);
  assert.equal(html.match(/data-side=/g)?.length, 2);
});

test('canvas shell disables horizontal overscroll and shows edge guards only for coarse pointers', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.pageShell\s*\{[^}]*overscroll-behavior-x:\s*none;/s);
  assert.match(
    css,
    /@media \(pointer: coarse\)[\s\S]*?\.edgeGuard\s*\{[\s\S]*?width:\s*20px;[\s\S]*?touch-action:\s*none;/
  );
  assert.match(css, /\.edgeGuard\[data-side='left'\]\s*\{[^}]*left:\s*0;/s);
  assert.match(css, /\.edgeGuard\[data-side='right'\]\s*\{[^}]*right:\s*0;/s);
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.equal(page.match(/<IslandEdgeSwipeGuard \/>/g)?.length, 3);
});
