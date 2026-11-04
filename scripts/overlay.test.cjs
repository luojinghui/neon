// Geometry regressions carried over from xy-pc-client's native Popover tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/components/ui/popover/utils/position.ts');
const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const moduleExports = {};
vm.runInNewContext(outputText, { exports: moduleExports }, { filename });
const position = options => ({ ...moduleExports.computePopoverPosition(options) });
const base = {
  anchor: { left: 200, top: 160, width: 80, height: 40 },
  popup: { width: 120, height: 60 }, placement: 'top',
  boundary: { left: 0, top: 0, right: 500, bottom: 400 }, autoAdjustOverflow: true
};

test('the migrated native geometry preserves all twelve placements', () => {
  for (const [placement, left, top] of [
    ['top', 180, 100], ['topLeft', 200, 100], ['topRight', 160, 100],
    ['bottom', 180, 200], ['bottomLeft', 200, 200], ['bottomRight', 160, 200],
    ['left', 80, 150], ['leftTop', 80, 160], ['leftBottom', 80, 140],
    ['right', 280, 150], ['rightTop', 280, 160], ['rightBottom', 280, 140]
  ]) assert.deepEqual(position({ ...base, placement }), { left, top, placement, shiftX: 0, shiftY: 0 });
});

test('viewport overflow flips the main axis and reverses only its offset', () => {
  for (const [placement, anchor, offset, actual, left, top] of [
    ['topLeft', { left: 200, top: 10, width: 80, height: 40 }, [7, -8], 'bottomLeft', 207, 58],
    ['bottomRight', { left: 200, top: 370, width: 80, height: 20 }, [7, 8], 'topRight', 167, 302],
    ['leftTop', { left: 5, top: 160, width: 30, height: 40 }, [-8, 7], 'rightTop', 43, 167],
    ['rightBottom', { left: 470, top: 160, width: 30, height: 40 }, [8, 7], 'leftBottom', 342, 147]
  ]) assert.deepEqual(position({ ...base, placement, anchor, offset }), { placement: actual, left, top, shiftX: 0, shiftY: 0 });
});

test('clipping containers shift cross-axis coordinates and retain preferred sides', () => {
  for (const [placement, anchor, left, top, shiftX, shiftY] of [
    ['topLeft', { left: 480, top: 160, width: 20, height: 40 }, 380, 100, -100, 0],
    ['bottomRight', { left: 0, top: 160, width: 20, height: 40 }, 0, 200, 100, 0],
    ['rightTop', { left: 200, top: 380, width: 80, height: 20 }, 280, 340, 0, -40],
    ['leftBottom', { left: 200, top: 0, width: 80, height: 20 }, 80, 0, 0, 40]
  ]) assert.deepEqual(position({ ...base, placement, anchor }), { placement, left, top, shiftX, shiftY });
  assert.deepEqual(position({ ...base, anchor: { left: 160, top: 105, width: 40, height: 20 }, boundary: { left: 100, top: 100, right: 300, bottom: 200 } }),
    { placement: 'bottom', left: 120, top: 125, shiftX: 0, shiftY: 0 });
});

test('explicit widths, manual overflow and invalid offsets keep their contracts', () => {
  const popup = Object.freeze({ width: 600, height: 60 });
  const result = position({ ...base, popup, offset: Object.freeze([7, -8]) });
  assert.equal(result.left, 0);
  assert.equal(result.top, 92);
  assert.equal(popup.width, 600);
  assert.deepEqual(position({ ...base, placement: 'topRight', anchor: { left: -20, top: 0, width: 40, height: 20 }, autoAdjustOverflow: false }),
    { left: -100, top: -60, placement: 'topRight', shiftX: 0, shiftY: 0 });
  assert.deepEqual(position({ ...base, offset: [NaN, Infinity] }), position(base));
});

function nativeModule(relative) {
  const filename = path.resolve(__dirname, '../src/components/ui', relative);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require }, { filename });
  return exports;
}
const dialogs = nativeModule('dialog-utils.ts');
const radius = nativeModule('popover/hooks/use-radius.ts');
const overlayStack = nativeModule('overlay-stack.ts');

test('dragging keeps the panel reachable in a shifted visual viewport', () => {
  const panel = { left: 100, top: 120, width: 320, height: 240 };
  const viewport = { left: 0, top: 50, width: 600, height: 500 };
  assert.deepEqual({ ...dialogs.clampDialogDrag({ x: -400, y: -500 }, panel, viewport) }, { x: -88, y: -58 });
  assert.deepEqual({ ...dialogs.clampDialogDrag({ x: 800, y: 800 }, panel, viewport) }, { x: 168, y: 178 });
  const oversized = { left: 80, top: 80, width: 900, height: 800 };
  assert.deepEqual({ ...dialogs.clampDialogDrag({ x: 800, y: 800 }, oversized, viewport) }, { x: -68, y: -18 });
});

test('nested dialog scroll locks preserve the original body styles until the final release', () => {
  const doc = { body: { style: { overflow: 'clip', paddingRight: '7px' } },
    documentElement: { clientWidth: 980 }, defaultView: { innerWidth: 1000, getComputedStyle: () => ({ paddingRight: '7px' }) } };
  const first = dialogs.lockDialogScroll(doc);
  const second = dialogs.lockDialogScroll(doc);
  assert.equal(doc.body.style.overflow, 'hidden');
  assert.equal(doc.body.style.paddingRight, '27px');
  first();
  assert.equal(doc.body.style.overflow, 'hidden');
  second();
  assert.equal(doc.body.style.overflow, 'clip');
  assert.equal(doc.body.style.paddingRight, '7px');
});

test('focusable controls include registered portals once and exclude hidden or negative-tabindex nodes', () => {
  const control = (name, { tabIndex = 0, hidden = false, visible = true } = {}) => ({ name, tabIndex,
    closest: () => hidden ? {} : null, getClientRects: () => visible ? [{}] : [] });
  const first = control('first');
  const popup = control('popup');
  const ignored = [control('tab-negative', { tabIndex: -1 }), control('hidden', { hidden: true }), control('not-rendered', { visible: false })];
  const result = dialogs.getDialogFocusable([{ querySelectorAll: () => [first, ...ignored, popup] }, { querySelectorAll: () => [popup] }]);
  assert.deepEqual(Array.from(result, item => item.name), ['first', 'popup']);
});

test('radius follows all child corners, preserves elliptical/capsule values, and explicit tokens take priority', () => {
  const inherited = { borderTopLeftRadius: '6px 12px', borderTopRightRadius: '9999px', borderBottomRightRadius: '50%', borderBottomLeftRadius: '0px' };
  assert.deepEqual({ ...radius.resolveOverlayRadius('auto', inherited, 'lg') }, inherited);
  assert.deepEqual({ ...radius.resolveOverlayRadius('inherit', inherited, 'sm') }, inherited);
  assert.deepEqual({ ...radius.resolveOverlayRadius('xl', inherited, 'lg') }, { borderRadius: 'var(--radius-xl)' });
  assert.deepEqual({ ...radius.resolveOverlayRadius(0, inherited, 'lg') }, { borderRadius: 0 });
  const square = Object.fromEntries(Object.keys(inherited).map(corner => [corner, '0px']));
  assert.deepEqual({ ...radius.resolveOverlayRadius('auto', square, 'lg') }, { borderRadius: 'var(--radius-lg)' });
  assert.deepEqual({ ...radius.resolveOverlayRadius('auto', square, 'sm') }, { borderRadius: 'var(--radius-sm)' });
  assert.deepEqual({ ...radius.resolveOverlayRadius('inherit', square, 'sm') }, square);
  const child = {};
  const wrapper = { firstElementChild: child, hasAttribute: () => true,
    ownerDocument: { defaultView: { getComputedStyle: source => { assert.equal(source, child); return inherited; } } } };
  assert.deepEqual({ ...radius.readTriggerRadii(wrapper) }, inherited);
});

test('nested portals keep descendant Escape ownership even when React mounts their effects first', () => {
  const doc = {};
  const outerToken = {}, innerToken = {}, popupToken = {};
  const innerAnchor = {}, popupAnchor = {};
  const outer = { contains: node => node === innerAnchor };
  const inner = { contains: node => node === popupAnchor };
  const popup = { contains: () => false };
  const levels = {};
  const removePopup = overlayStack.registerOverlay(doc, { token: popupToken, kind: 'popup', node: popup, anchor: popupAnchor, base: 1030, changed: level => { levels.popup = level; } });
  const removeInner = overlayStack.registerOverlay(doc, { token: innerToken, kind: 'modal', node: inner, anchor: innerAnchor, base: 1000, changed: level => { levels.inner = level; } });
  const removeOuter = overlayStack.registerOverlay(doc, { token: outerToken, kind: 'modal', node: outer, anchor: null, base: 1000, changed: level => { levels.outer = level; } });
  assert.ok(levels.outer < levels.inner && levels.inner < levels.popup);
  assert.equal(overlayStack.isTopOverlay(doc, popupToken), true);
  assert.equal(overlayStack.isTopOverlay(doc, innerToken, true), true);
  assert.equal(overlayStack.isTopOverlay(doc, outerToken), false);
  removePopup();
  assert.equal(overlayStack.isTopOverlay(doc, innerToken), true);
  removeInner();
  assert.equal(overlayStack.isTopOverlay(doc, outerToken), true);
  removeOuter();
  assert.equal(overlayStack.isTopOverlay(doc, outerToken), false);
});
