const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name) {
  const filename = path.join(__dirname, '../src/modules/webrtc', name + '.ts');
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports }, { filename });
  return module.exports;
}
const board = load('whiteboard');
const sharing = load('sharing');
const clean = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .000001, `${actual} should be near ${expected}`);
const stroke = { id: 'stroke-one', authorId: 'self', kind: 'stroke', color: '#334155', width: 4, points: [[-600, -400], [-300, -200], [100, 100]] };
const shape = { id: 'shape-one', authorId: 'self', kind: 'shape', shape: 'rectangle', color: '#2563eb', width: 4, fill: false, x: -100, y: -80, endX: 300, endY: 240 };

test('drawing uses the inverse of the current pan and zoom, including negative world coordinates', () => {
  for (const camera of [{ x: 180, y: 90, zoom: .1 }, { x: -440, y: 700, zoom: .4 }, { x: 0, y: 0, zoom: 1 }, { x: 500, y: -800, zoom: 4 }]) {
    const point = [-2800, 1800];
    const pixel = board.boardToScreen(point, camera);
    const restored = board.screenToBoard(pixel, camera);
    near(restored[0], point[0]); near(restored[1], point[1]);
    const cursor = [143, 217];
    const before = board.screenToBoard(cursor, camera);
    for (const zoom of [.05, .6, 2, 8]) {
      const next = board.zoomBoardAt(camera, zoom, cursor);
      const after = board.screenToBoard(cursor, next);
      near(after[0], before[0]); near(after[1], before[1]);
      assert.ok(next.zoom >= .1 && next.zoom <= 4);
    }
    assert.equal(stroke.width, 4, 'viewport changes do not rewrite brush width or shared drawing data');
  }
});

test('moving strokes, shapes and multiline text preserves geometry across the origin', () => {
  const moved = board.moveBoardItem(stroke, 1500, -1600);
  assert.deepEqual(clean(moved.points), [[900, -2000], [1200, -1800], [1600, -1500]]);
  assert.deepEqual(stroke.points, [[-600, -400], [-300, -200], [100, 100]], 'original points remain immutable');
  const movedShape = board.moveBoardItem(shape, -2000, 4000);
  assert.equal(movedShape.x, -2100); assert.equal(movedShape.endY, 4240);
  assert.equal(movedShape.endX - movedShape.x, shape.endX - shape.x);
  const text = { id: 'text-one', authorId: 'self', kind: 'text', color: '#334155', text: '你好\nhello', fontSize: 28, x: 20, y: 30 };
  const movedText = board.moveBoardItem(text, -2500, -3000);
  assert.equal(movedText.x, -2480); assert.equal(movedText.y, -2970);
  const box = board.boardTextBox(text);
  assert.deepEqual(clean(box.lines), ['你好', 'hello']);
  assert.ok(box.height > 28 * 2);
  const boundary = board.moveBoardItem(stroke, -1e10, 1e10);
  assert.ok(boundary.points.every(point => point.every(value => value >= -1000000 && value <= 1000000)));
});

test('selection follows visible geometry rather than claiming the blank interior of outlines', () => {
  assert.equal(board.hitTestBoardItem(stroke, [-450, -300], 5), true);
  assert.equal(board.hitTestBoardItem(stroke, [-450, 80], 5), false);
  assert.equal(board.hitTestBoardItem(shape, [-100, 20], 5), true);
  assert.equal(board.hitTestBoardItem(shape, [100, 100], 5), false);
  assert.equal(board.hitTestBoardItem({ ...shape, fill: true }, [100, 100], 5), true);
  assert.equal(board.hitTestBoardItem({ ...shape, shape: 'ellipse' }, [300, 80], 5), true);
  assert.equal(board.hitTestBoardItem({ ...shape, shape: 'line' }, [100, 80], 5), true);
});

test('fit-to-content reveals negative and off-page drawings without changing any shared coordinates', () => {
  const values = [stroke, { ...shape, x: 1600, y: 1000, endX: 2200, endY: 1400 }];
  const snapshot = JSON.stringify(values);
  const camera = board.fitBoardItems(values, 900, 600);
  for (const item of values) {
    const box = board.boardItemBounds(item);
    const first = board.boardToScreen([box.x, box.y], camera);
    const last = board.boardToScreen([box.x + box.width, box.y + box.height], camera);
    assert.ok(first[0] >= 39 && first[1] >= 39);
    assert.ok(last[0] <= 861 && last[1] <= 561);
  }
  assert.equal(JSON.stringify(values), snapshot);
  assert.deepEqual(clean(board.fitBoardItems([], 400, 600)), { x: 200, y: 300, zoom: 1 });
});

test('collaborative shape updates replace by id and clearing advances epoch immutably', () => {
  const original = { id: 'board', kind: 'whiteboard', ownerId: 'self', page: 1, scroll: 0, epoch: 0, items: [stroke] };
  const withShape = sharing.applyBoardAction(original, { type: 'put', item: shape });
  const changed = sharing.applyBoardAction(withShape, { type: 'put', item: { ...shape, endX: -4000 } });
  assert.equal(original.items.length, 1);
  assert.equal(changed.items.length, 2);
  assert.equal(changed.items[1].endX, -4000);
  const cleared = sharing.applyBoardAction(changed, { type: 'clear', epoch: 1 });
  assert.equal(cleared.epoch, 1); assert.equal(cleared.items.length, 0);
  assert.equal(changed.items.length, 2);
});

test('rectangle and ellipse resizing keeps the visual top-left anchored in every drawing direction', () => {
  for (const type of ['rectangle', 'ellipse']) {
    for (const reverseX of [false, true]) for (const reverseY of [false, true]) {
      const item = { ...shape, shape: type, x: reverseX ? 300 : 100, endX: reverseX ? 100 : 300, y: reverseY ? 200 : 100, endY: reverseY ? 100 : 200 };
      const original = JSON.stringify(item);
      const resized = board.resizeBoardShape(item, 50, 80);
      assert.deepEqual(clean(board.boardItemBounds(resized)), { x: 100, y: 100, width: 250, height: 180 });
      assert.equal(resized.x > resized.endX, reverseX);
      assert.equal(resized.y > resized.endY, reverseY);
      assert.deepEqual(clean(board.resizeBoardShape(item, 0, 0)), item, 'padded handle grab without movement leaves geometry unchanged');
      assert.equal(JSON.stringify(item), original);
    }
  }
});

test('line and arrow resizing follows their actual endpoint without moving the start', () => {
  for (const type of ['line', 'arrow']) {
    const item = { ...shape, shape: type, x: 100, y: 80, endX: -200, endY: -300 };
    const resized = board.resizeBoardShape(item, -50, 20);
    assert.equal(resized.x, 100); assert.equal(resized.y, 80);
    assert.equal(resized.endX, -250); assert.equal(resized.endY, -280);
    assert.deepEqual(clean(board.resizeBoardShape(item, 0, 0)), item);
  }
});

test('shape resize supports negative space and clamps endpoints at the server world boundary', () => {
  const negative = { ...shape, x: -100, y: -50, endX: -300, endY: -200 };
  const expanded = board.resizeBoardShape(negative, 50, 70);
  assert.deepEqual(clean(board.boardItemBounds(expanded)), { x: -300, y: -200, width: 250, height: 220 });
  const nearLimit = { ...shape, x: 999950, y: -999950, endX: 999900, endY: -999900 };
  const limited = board.resizeBoardShape(nearLimit, 1e8, -1e8);
  assert.equal(limited.x, 1000000); assert.equal(limited.endX, 999900);
  assert.equal(limited.y, -999950); assert.equal(limited.endY, -999949);
  const line = board.resizeBoardShape({ ...negative, shape: 'line' }, -1e8, 1e8);
  assert.equal(line.endX, -1000000); assert.equal(line.endY, 1000000);
});
