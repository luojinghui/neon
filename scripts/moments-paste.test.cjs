const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTsModule(relativePath, globals = {}) {
  const fullPath = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  const exports = {};
  const moduleObj = { exports };
  vm.runInNewContext(outputText, {
    exports,
    module: moduleObj,
    require: () => ({}),
    File: globalThis.File,
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    atob: globalThis.atob,
    Uint8Array,
    Array,
    Set,
    Number,
    Math,
    Date,
    RegExp,
    ...globals
  });
  return moduleObj.exports;
}

test('blockDraft inserts interleaved segments at cursor, caps inline images at 30, removes images and merges text cleanly', () => {
  const draft = loadTsModule('src/app/moments/blockDraft.ts');
  const initial = draft.createEmptyDraftBlocks();
  initial[0].text = '前缀后缀';

  const fileA = new File(['img-a'], 'a.png', { type: 'image/png' });
  const inserted = draft.insertSegmentsIntoBlocks(
    initial,
    initial[0].id,
    2,
    2,
    [
      { type: 'text', text: '中段一' },
      { type: 'image-file', file: fileA, alt: '图一' },
      { type: 'text', text: '中段二' },
      { type: 'image-url', url: 'https://example.com/b.png', alt: '图二' },
      { type: 'text', text: '尾段' }
    ],
    { createPreviewUrl: (f) => `blob:${f.name}` }
  );

  assert.equal(inserted.overflowImageCount, 0);
  assert.equal(inserted.pendingRemoteIds.length, 1);
  assert.equal(inserted.pendingRemoteIds[0].url, 'https://example.com/b.png');
  assert.deepEqual(
    Array.from(inserted.blocks, (b) => b.type === 'text' ? `T:${b.text}` : `I:${b.status}:${b.alt}`),
    ['T:前缀中段一', 'I:ready:图一', 'T:中段二', 'I:loading:图二', 'T:尾段后缀']
  );

  // Removing the first image merges surrounding text blocks.
  const afterRemove = draft.removeImageBlock(inserted.blocks, inserted.blocks[1].id);
  assert.deepEqual(
    Array.from(afterRemove.blocks, (b) => b.type === 'text' ? `T:${b.text}` : `I:${b.status}`),
    ['T:前缀中段一\n\n中段二', 'I:loading', 'T:尾段后缀']
  );

  // Enforce 30 inline image limit.
  const manySegments = Array.from({ length: 35 }, (_, i) => ({ type: 'image-url', url: `https://example.com/${i}.png`, alt: '' }));
  const capped = draft.insertSegmentsIntoBlocks(draft.createEmptyDraftBlocks(), '', 0, 0, manySegments);
  assert.equal(draft.countDraftInlineImages(capped.blocks), 30);
  assert.equal(capped.overflowImageCount, 5);
  assert.equal(capped.pendingRemoteIds.length, 30);

  // Submission omits blocks when there are no ready inline images.
  const plainSubmission = draft.buildMomentSubmission([{ id: '1', type: 'text', text: '纯文字\n第二行' }]);
  assert.equal(plainSubmission.text, '纯文字\n第二行');
  assert.equal(plainSubmission.blocks, undefined);
  assert.equal(plainSubmission.inlineImages.length, 0);

  // Submission builds interleaved payload when inline images exist.
  const richSubmission = draft.buildMomentSubmission([
    { id: '1', type: 'text', text: '段落一' },
    { id: '2', type: 'image', status: 'ready', file: fileA, alt: '图一' },
    { id: '3', type: 'text', text: '段落二' }
  ]);
  assert.equal(richSubmission.text, '段落一\n\n段落二');
  assert.equal(richSubmission.inlineImages.length, 1);
  assert.deepEqual(
    Array.from(richSubmission.blocks, (b) => ({ ...b })),
    [
      { type: 'text', text: '段落一' },
      { type: 'image', inlineIndex: 0, alt: '图一' },
      { type: 'text', text: '段落二' }
    ]
  );
});

test('pasteParser preserves HTML block line breaks, extracts lazy data-src images, converts emoji imgs to alt, and keeps standalone screenshots separate', () => {
  // Minimal DOM node tree harness for testing parseHtmlToSegments & parseMomentClipboard without browser.
  function el(tag, attrs = {}, children = []) {
    const node = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      attrs,
      childNodes: [],
      children: [],
      parentElement: null,
      previousElementSibling: null,
      hasAttribute: (k) => k in attrs,
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      get textContent() {
        return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
      }
    };
    let prevEl = null;
    for (const child of children) {
      const c = typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child;
      c.parentElement = node;
      node.childNodes.push(c);
      if (c.nodeType === 1) {
        c.previousElementSibling = prevEl;
        prevEl = c;
        node.children.push(c);
      }
    }
    return node;
  }

  let parsedBody = null;
  class FakeDOMParser {
    parseFromString() {
      return { body: parsedBody };
    }
  }

  const parser = loadTsModule('src/app/moments/pasteParser.ts', { DOMParser: FakeDOMParser });

  // Case 1: Rich article with <p>, emoji <img>, WeChat lazy data-src <img>, and <ul><li>.
  parsedBody = el('body', {}, [
    el('p', {}, ['第一段', el('img', { class: 'emoji', alt: '🔥', src: 'https://cdn.example/twemoji/fire.png', width: '16', height: '16' }), '结束']),
    el('img', { src: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data-src': 'https://mmbiz.qpic.cn/photo1.jpg', alt: '配图1' }),
    el('ul', {}, [
      el('li', {}, ['要点一']),
      el('li', {}, ['要点二'])
    ])
  ]);

  const segments = parser.parseHtmlToSegments('<html>mock</html>');
  assert.deepEqual(
    Array.from(segments, (s) => ({ ...s })),
    [
      { type: 'text', text: '第一段🔥结束' },
      { type: 'image-url', url: 'https://mmbiz.qpic.cn/photo1.jpg', alt: '配图1' },
      { type: 'text', text: '• 要点一\n• 要点二' }
    ]
  );

  // Case 2: Standalone screenshot paste (file with no text) -> isStandaloneImages = true.
  parsedBody = el('body', {}, [el('img', { src: 'https://example.com/only.png' })]);
  const shot = new File(['png'], 'shot.png', { type: 'image/png' });
  const standalone = parser.parseMomentClipboard({
    items: [{ kind: 'file', getAsFile: () => shot }],
    files: [shot],
    getData: (type) => (type === 'text/html' ? '<img src="https://example.com/only.png">' : '')
  });
  assert.equal(standalone.isStandaloneImages, true);
  assert.equal(standalone.segments.length, 1);
  assert.equal(standalone.segments[0].type, 'image-file');

  // Case 3: HTML with collapsed plain text -> HTML line breaks win.
  parsedBody = el('body', {}, [
    el('div', {}, ['第一行']),
    el('div', {}, ['第二行']),
    el('div', {}, ['第三行'])
  ]);
  const textOnly = parser.parseMomentClipboard({
    items: [],
    files: [],
    getData: (type) => (type === 'text/html' ? '<div>第一行</div><div>第二行</div><div>第三行</div>' : '第一行第二行第三行')
  });
  assert.equal(textOnly.isStandaloneImages, false);
  assert.equal(textOnly.hasImages, false);
  assert.deepEqual(Array.from(textOnly.segments, (s) => ({ ...s })), [{ type: 'text', text: '第一行\n第二行\n第三行' }]);
});

test('splitTrailingImages distinguishes trailing photo galleries from interleaved rich articles', () => {
  const format = loadTsModule('src/app/moments/format.ts');
  const img1 = { type: 'image', id: 'i1', url: '/uploads/moments/1.png', mimeType: 'image/png', size: 10, name: '1.png' };
  const img2 = { type: 'image', id: 'i2', url: '/uploads/moments/2.png', mimeType: 'image/png', size: 10, name: '2.png' };

  // Text followed only by trailing images -> routed to MomentMediaView grid.
  const trailing = format.splitTrailingImages([{ type: 'text', text: '晚霞' }, img1, img2]);
  assert.equal(trailing.hasInterleavedImages, false);
  assert.equal(trailing.interleavedBlocks.length, 1);
  assert.equal(trailing.trailingImages.length, 2);

  // Text -> Image -> Text -> stays interleaved.
  const interleaved = format.splitTrailingImages([{ type: 'text', text: '上文' }, img1, { type: 'text', text: '下文' }]);
  assert.equal(interleaved.hasInterleavedImages, true);
  assert.equal(interleaved.interleavedBlocks.length, 3);
  assert.equal(interleaved.trailingImages.length, 0);
});

test('createDraftBlocksFromMoment hydrates legacy media images and existing blocks for re-editing', () => {
  const draft = loadTsModule('src/app/moments/blockDraft.ts');
  const legacyHydrated = draft.createDraftBlocksFromMoment({
    id: 'm1',
    text: '旧帖正文',
    media: [
      { id: 'img-legacy-1', type: 'image', url: '/uploads/moments/old.png', mimeType: 'image/png', size: 10, name: 'old.png' },
      { id: 'vid-1', type: 'video', url: '/uploads/moments/v.mp4', mimeType: 'video/mp4', size: 100, name: 'v.mp4' }
    ]
  });
  assert.deepEqual(
    Array.from(legacyHydrated, (b) => b.type === 'text' ? `T:${b.text}` : `E:${b.existingId}`),
    ['T:旧帖正文', 'E:img-legacy-1', 'T:']
  );

  const submission = draft.buildMomentSubmission(legacyHydrated);
  assert.equal(submission.text, '旧帖正文');
  assert.equal(submission.inlineImages.length, 0);
  assert.deepEqual(
    Array.from(submission.blocks, (b) => ({ ...b })),
    [
      { type: 'text', text: '旧帖正文' },
      { type: 'image', existingId: 'img-legacy-1', alt: undefined }
    ]
  );
});
