const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, require);
  return exports;
}

const scroll = load('src/app/moments/listScroll.ts');

function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('星河列表滚动位置只保存合法值，读一次后仍可清除', () => {
  const storage = memory();
  scroll.writeMomentListScroll(480.6, storage);
  assert.equal(scroll.readMomentListScroll(storage), 481);
  scroll.clearMomentListScroll(storage);
  assert.equal(scroll.readMomentListScroll(storage), null);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    scroll.writeMomentListScroll(value, storage);
    assert.equal(scroll.readMomentListScroll(storage), null);
  }
  storage.setItem('neon:moments-list-scroll', 'oops');
  assert.equal(scroll.readMomentListScroll(storage), null);
});
