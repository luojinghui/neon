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
const momentId = 'a'.repeat(16);

function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('返回后按卡片在视口中的位置对齐，而不是只恢复滚动条数值', () => {
  assert.equal(scroll.alignMomentListScroll(640, 220, 80), 780);
  assert.equal(scroll.alignMomentListScroll(500, -40, -120), 580);
  assert.equal(scroll.alignMomentListScroll(30, 10, 100), 0);
  assert.equal(scroll.alignMomentListScroll(100, 40.4, 40.6), 100);
  assert.equal(scroll.momentListPlaceSettled(81, 80), true);
  assert.equal(scroll.momentListPlaceSettled(84, 80), false);
});

test('星河列表位置记录卡片和滚动条，并拒绝无效数据', () => {
  const storage = memory();
  const place = { id: momentId, offset: -36.2, top: 640.8 };
  scroll.writeMomentListPlace(place, storage);
  assert.deepEqual(scroll.readMomentListPlace(storage), { id: momentId, offset: -36, top: 641 });
  scroll.clearMomentListPlace(storage);
  assert.equal(scroll.readMomentListPlace(storage), null);
  for (const value of ['oops', JSON.stringify({ id: 'short', offset: 1, top: 1 }), JSON.stringify({ id: momentId, offset: '1', top: 1 })]) {
    storage.setItem('neon:moments-list-place', value);
    assert.equal(scroll.readMomentListPlace(storage), null);
  }
});
