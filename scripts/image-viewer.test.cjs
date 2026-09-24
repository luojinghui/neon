const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/components/image-viewer/image-viewer-gestures.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const gestures = {};
new Function('exports', compiled.outputText)(gestures);
const { constrainTransform, pinchTransform, swipeDirection } = gestures;

test('a horizontal swipe advances in either direction on phone and desktop', () => {
  assert.equal(swipeDirection(-90, 8, 500, 390), 1);
  assert.equal(swipeDirection(90, -8, 500, 390), -1);
  assert.equal(swipeDirection(-120, 0, 700, 1280), 1);
});

test('a short deliberate flick advances, while taps and slow short drags stay put', () => {
  assert.equal(swipeDirection(-35, 2, 60, 390), 1);
  assert.equal(swipeDirection(-35, 2, 500, 390), 0);
  assert.equal(swipeDirection(-8, 0, 1, 390), 0);
});

test('vertical and ambiguous diagonal movements never switch photos', () => {
  assert.equal(swipeDirection(30, 120, 100, 390), 0);
  assert.equal(swipeDirection(-90, 85, 100, 390), 0);
});

test('zoom and pan are bounded by the actual fitted photo, including portrait images', () => {
  assert.deepEqual(constrainTransform({ scale: 2, x: 500, y: -900 }, { width: 300, height: 600 }, { width: 1000, height: 600 }), { scale: 2, x: 0, y: -300 });
  assert.deepEqual(constrainTransform({ scale: 2, x: 500, y: 900 }, { width: 1000, height: 600 }, { width: 1000, height: 600 }), { scale: 2, x: 500, y: 300 });
});

test('returning to fit clears offsets, and zoom cannot exceed four times fit', () => {
  assert.deepEqual(constrainTransform({ scale: 0.5, x: 300, y: -200 }, { width: 390, height: 260 }, { width: 390, height: 600 }), { scale: 1, x: 0, y: 0 });
  assert.equal(constrainTransform({ scale: 8, x: 0, y: 0 }, { width: 390, height: 260 }, { width: 390, height: 600 }).scale, 4);
});

test('pinch zoom preserves the image point under the fingers and follows their midpoint', () => {
  assert.deepEqual(pinchTransform({ scale: 1, x: 0, y: 0 }, { x: 100, y: 50 }, { x: 110, y: 70 }, 2), { scale: 2, x: -90, y: -30 });
});

test('pinch translation uses the bounded scale at the zoom limit', () => {
  assert.deepEqual(pinchTransform({ scale: 2, x: 20, y: 10 }, { x: 100, y: 50 }, { x: 100, y: 50 }, 10), { scale: 4, x: -60, y: -30 });
});
