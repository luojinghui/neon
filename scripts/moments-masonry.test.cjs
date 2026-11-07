const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/moments/masonry.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});

function fixture(heights = [120.4, 360, 180]) {
  const frames = new Map();
  const observers = [];
  let frameId = 0;
  class Element {
    constructor(height = 0) {
      this.height = height;
      this.children = [];
      this.dataset = {};
      this.events = new Map();
      this.style = { removeProperty(name) { if (name === 'grid-row-end') delete this.gridRowEnd; } };
    }
    getBoundingClientRect() { return { height: this.height }; }
    addEventListener(name, callback, capture) { this.events.set(name, { callback, capture }); }
    removeEventListener(name, callback, capture) {
      const handler = this.events.get(name);
      assert.equal(handler?.callback, callback);
      assert.equal(handler?.capture, capture);
      this.events.delete(name);
    }
    emit(name) { this.events.get(name)?.callback(); }
  }
  const feed = new Element();
  feed.children = heights.map(height => new Element(height));
  const window = new Element();
  window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const layout = { gridTemplateColumns: '478px 478px', columnGap: '20px' };
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, HTMLElement: Element, window, getComputedStyle: () => layout,
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.items = []; observers.push(this); }
      observe(item) { this.items.push(item); }
      disconnect() { this.items = []; }
    }
  });
  const mount = () => exports.observeMomentMasonry(feed);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  return { feed, window, frames, observers, layout, mount, flush, Element };
}

test('mixed-height cards retain DOM order and are measured independently with fractional rounding', () => {
  const f = fixture();
  const original = [...f.feed.children];
  const stop = f.mount();
  assert.equal(f.feed.dataset.masonry, 'ready');
  assert.deepEqual(f.feed.children.map(card => card.style.gridRowEnd), ['span 141', 'span 380', 'span 200']);
  assert.deepEqual(f.feed.children, original);
  assert.deepEqual(f.observers[0].items, [f.feed, ...original]);
  stop();
});

test('image, video metadata and expanded text coalesce into a fresh layout without stretching other cards', () => {
  const f = fixture();
  const stop = f.mount();
  f.feed.children[0].height = 480;
  f.feed.emit('load');
  f.feed.emit('loadedmetadata');
  f.observers[0].callback();
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.feed.children[0].style.gridRowEnd, 'span 500');
  assert.equal(f.feed.children[1].style.gridRowEnd, 'span 380');
  f.feed.children[0].height = 120;
  f.observers[0].callback();
  f.flush();
  assert.equal(f.feed.children[0].style.gridRowEnd, 'span 140');
  stop();
});

test('phone layouts clear desktop placement and recompute widths, heights and spacing when returning', () => {
  const f = fixture();
  const stop = f.mount();
  f.layout.gridTemplateColumns = '358px';
  f.window.emit('resize');
  f.flush();
  assert.equal(f.feed.dataset.masonry, undefined);
  assert.ok(f.feed.children.every(card => card.style.gridRowEnd === undefined));
  f.layout.gridTemplateColumns = '400px 400px';
  f.layout.columnGap = '24px';
  f.feed.children[1].height = 420.5;
  f.observers[0].callback();
  f.flush();
  assert.equal(f.feed.dataset.masonry, 'ready');
  assert.equal(f.feed.children[1].style.gridRowEnd, 'span 445');
  stop();
});

test('cleanup cancels pending layout and pagination remounts only the current cards', () => {
  const f = fixture();
  const stop = f.mount();
  f.feed.emit('loadedmetadata');
  const staleFrame = [...f.frames.values()][0];
  stop();
  staleFrame();
  f.observers[0].callback();
  assert.equal(f.frames.size, 0);
  assert.equal(f.feed.dataset.masonry, undefined);
  assert.equal(f.feed.events.size, 0);
  assert.equal(f.window.events.size, 0);
  assert.equal(f.observers[0].items.length, 0);
  f.feed.children.splice(1, 1);
  const added = new f.Element(240);
  f.feed.children.push(added);
  const stopAgain = f.mount();
  assert.equal(added.style.gridRowEnd, 'span 260');
  assert.deepEqual(f.observers[1].items, [f.feed, ...f.feed.children]);
  stopAgain();
});
