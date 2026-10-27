// Regression for the bounded cloud/plaza editor. It never starts a server.
// CLOUD_QA_URL=http://127.0.0.1:3000 PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright node scripts/cloud-editor-browser.cjs
// Optional: PLAYWRIGHT_BROWSERS=chromium,webkit CLOUD_EDITOR_QA_OUTPUT=.cache/cloud-editor-qa
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

assert.ok(process.env.CLOUD_QA_URL, 'CLOUD_QA_URL must point to an already-running isolated app server');
const origin = new URL(process.env.CLOUD_QA_URL).origin;
const output = path.resolve(process.env.CLOUD_EDITOR_QA_OUTPUT || '.cache/cloud-editor-qa');
fs.mkdirSync(output, { recursive: true });
const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 600 },
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 568, mobile: true },
  { width: 844, height: 390, mobile: true }
];
const marker = 'FINAL-LINE-987654321';
const longText = [...Array.from({ length: 96 }, (_, index) => `第 ${String(index + 1).padStart(2, '0')} 行 · https://example.com/editor/${index} · 可以内部滚动的正文`), marker].join('\r\n');
const singleLine = `https://example.com/${'abcdefghij0123456789'.repeat(750)}-${marker}`;
const normalized = value => value.replace(/\r\n?/g, '\n');
const view = (page, destination) => page.locator(`[data-cloud-view="${destination}"]`);
const panel = (page, destination) => view(page, destination).locator('.cloud-editor');
const input = (page, destination) => view(page, destination).getByRole('textbox', { name: '发送内容', exact: true });
const tab = (page, destination) => page.getByRole('navigation', { name: '云传导航' }).getByRole('link', { name: destination === 'cloud' ? '云传' : '广场', exact: true });
const approx = (actual, expected, label, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}`);

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}

async function activate(page, destination) {
  await tab(page, destination).click();
  await view(page, destination).waitFor({ state: 'visible' });
  await settle(page);
}

async function geometry(page, destination) {
  return panel(page, destination).evaluate(element => {
    const rect = node => {
      if (!node) return null;
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom };
    };
    const textarea = element.querySelector('textarea');
    const toolbar = element.querySelector('.cloud-editor-toolbar');
    const list = element.querySelector('.cloud-editor-file-list');
    const overlay = element.querySelector('.cloud-editor-surface [class*="overlay"]');
    const viewport = window.visualViewport;
    return {
      panel: rect(element), surface: rect(element.querySelector('.cloud-editor-surface')), input: rect(textarea),
      heading: rect(element.querySelector('.cloud-editor-heading')), toolbar: rect(toolbar),
      toolbarPosition: getComputedStyle(toolbar).position,
      textarea: { clientHeight: textarea.clientHeight, scrollHeight: textarea.scrollHeight, scrollTop: textarea.scrollTop, clientWidth: textarea.clientWidth, scrollWidth: textarea.scrollWidth, overflowY: getComputedStyle(textarea).overflowY, lineHeight: parseFloat(getComputedStyle(textarea).lineHeight) },
      attachments: rect(element.querySelector('.cloud-editor-attachments')),
      fileList: list ? { ...rect(list), clientHeight: list.clientHeight, scrollHeight: list.scrollHeight, overflowY: getComputedStyle(list).overflowY } : null,
      overlay: overlay ? { ...rect(overlay), scrollTop: overlay.scrollTop, clientHeight: overlay.clientHeight, scrollHeight: overlay.scrollHeight } : null,
      viewport: { width: innerWidth, height: innerHeight, visualHeight: viewport?.height ?? innerHeight, offsetTop: viewport?.offsetTop ?? 0 },
      pageWidth: document.documentElement.scrollWidth
    };
  });
}

function clearSeparation(measurements, label) {
  assert.equal(measurements.toolbarPosition, 'static', `${label}: buttons occupy normal document flow`);
  const gap = measurements.viewport.width <= 640 ? 14 : 16;
  assert.ok(measurements.toolbar.y >= measurements.input.bottom + gap - 1, `${label}: at least ${gap}px separates text and toolbar: ${JSON.stringify(measurements)}`);
  assert.ok(measurements.pageWidth <= measurements.viewport.width + 1, `${label}: page has no horizontal overflow`);
  assert.ok(measurements.textarea.scrollWidth <= measurements.textarea.clientWidth + 1, `${label}: textarea wraps long lines instead of horizontal scrolling`);
}

function internallyScrollable(measurements, label) {
  clearSeparation(measurements, label);
  assert.ok(measurements.textarea.clientHeight >= measurements.textarea.lineHeight, `${label}: at least one editable line remains on short or keyboard viewports`);
  assert.ok(measurements.input.height <= Math.max(146, measurements.viewport.visualHeight), `${label}: text height is bounded by the available viewport`);
  assert.ok(measurements.textarea.scrollHeight > measurements.textarea.clientHeight + 100, `${label}: long text scrolls inside the textarea`);
  assert.ok(['auto', 'scroll'].includes(measurements.textarea.overflowY), `${label}: native internal scrolling is enabled`);
}

function equivalent(cloud, plaza, label) {
  for (const part of ['panel', 'surface', 'input', 'heading', 'toolbar']) {
    for (const property of ['x', 'width', 'height']) approx(cloud[part][property], plaza[part][property], `${label}: ${part}.${property}`);
  }
  approx(cloud.surface.y - cloud.panel.y, plaza.surface.y - plaza.panel.y, `${label}: writing surfaces have equal relative top offsets`);
  approx(cloud.toolbar.y - cloud.input.bottom, plaza.toolbar.y - plaza.input.bottom, `${label}: toolbar gaps match`);
}

async function scrollTextToEnd(page, destination) {
  await input(page, destination).evaluate(textarea => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.scrollTop = textarea.scrollHeight;
    textarea.dispatchEvent(new Event('scroll'));
  });
  await settle(page);
  let measured = await geometry(page, destination);
  assert.ok(measured.textarea.scrollTop + measured.textarea.clientHeight >= measured.textarea.scrollHeight - 2, `${destination}: final line is inside the visible native text viewport`);
  assert.ok((await input(page, destination).inputValue()).endsWith(marker), `${destination}: exact final line is retained`);
  await input(page, destination).blur();
  await settle(page);
  measured = await geometry(page, destination);
  if (measured.overlay) {
    approx(measured.overlay.height, measured.textarea.clientHeight, `${destination}: link overlay follows the bounded textarea`, 2);
    approx(measured.overlay.scrollTop, measured.textarea.scrollTop, `${destination}: link overlay scroll position follows native text`, 2);
  }
  return measured;
}

async function makeToolbarReachable(page, destination, allowScroll) {
  const selector = `[data-cloud-view="${destination}"] .cloud-editor-toolbar`;
  if (allowScroll) {
    await page.locator(selector).evaluate(toolbar => {
      toolbar.scrollIntoView({ block: 'end', behavior: 'instant' });
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
      const bounds = toolbar.getBoundingClientRect();
      const container = toolbar.closest('.content');
      if (container && bounds.bottom > bottom - 4) container.scrollTop += bounds.bottom - bottom + 4;
      const current = toolbar.getBoundingClientRect();
      if (container && current.top < (viewport?.offsetTop ?? 0) + 2) container.scrollTop -= (viewport?.offsetTop ?? 0) + 2 - current.top;
    });
    await settle(page);
  }
  const measured = await geometry(page, destination);
  const visualTop = measured.viewport.offsetTop;
  const visualBottom = visualTop + measured.viewport.visualHeight;
  assert.ok(measured.toolbar.y >= visualTop - 1 && measured.toolbar.bottom <= visualBottom + 1, `${destination}: action row stays reachable inside the visual viewport: ${JSON.stringify(measured)}`);
  const button = panel(page, destination).getByRole('button', { name: /文件$/ });
  await button.click({ trial: true });
  const chooserReady = page.waitForEvent('filechooser');
  await button.click();
  const chooser = await chooserReady;
  await chooser.setFiles([]);
  return measured;
}

async function expandedEditor(page, destination) {
  const mainInput = input(page, destination);
  await mainInput.evaluate(element => {
    element.focus({ preventScroll: true });
    element.setSelectionRange(12, 25);
  });
  await panel(page, destination).getByRole('button', { name: '展开编辑', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const accessibleName = await dialog.evaluate(element => {
    const label = element.getAttribute('aria-label');
    const labelledBy = element.getAttribute('aria-labelledby');
    return label || labelledBy?.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
  });
  assert.ok(accessibleName, 'expanded editor dialog has an accessible name');
  const expanded = dialog.getByRole('textbox', { name: '展开编辑内容', exact: true });
  assert.ok((await expanded.boundingBox()).width > 0, 'expanded text input is visible');
  assert.equal(await expanded.inputValue(), normalized(longText), `${destination}: expanded editor opens the same draft`);
  const prevented = await expanded.evaluate(element => {
    const file = new File(['expanded attachment'], 'expanded-drop.txt', { type: 'text/plain' });
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    // WebKit's constructed filesystem entries cannot read their backing File
    // (NotFoundError). Use the standard getAsFile fallback to check drop wiring.
    Object.defineProperty(event, 'dataTransfer', { value: { items: [{ kind: 'file', getAsFile: () => file }], files: [file] } });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(prevented, true, `${destination}: expanded editing handles file drops instead of navigating away`);
  await dialog.getByText('已选择 1 个附件，完成编辑后可发送', { exact: true }).waitFor();
  const revised = `${normalized(longText)}\n展开编辑同步内容`;
  await expanded.fill(revised);
  assert.equal(await mainInput.inputValue(), revised, `${destination}: expanded edits update the original draft immediately`);
  await expanded.evaluate(element => { element.focus(); element.setSelectionRange(40, 44); });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(destination => document.activeElement === document.querySelector(`[data-cloud-view="${destination}"] textarea`), destination);
  const restored = await mainInput.evaluate(element => ({ value: element.value, start: element.selectionStart, end: element.selectionEnd }));
  assert.equal(restored.value, revised);
  assert.equal(restored.start, 40, `${destination}: closing expanded editor restores the edited selection start`);
  assert.equal(restored.end, 44, `${destination}: closing expanded editor restores the edited selection end`);
  await mainInput.fill(longText);
  await mainInput.blur();
  await settle(page);
}

async function installViewportSimulation(page) {
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error('This browser has no visualViewport');
    const values = { height: viewport.height, offsetTop: viewport.offsetTop };
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => values.height },
      offsetTop: { configurable: true, get: () => values.offsetTop }
    });
    window.__qaEditorVisualViewport = next => {
      Object.assign(values, next);
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    };
  });
}

async function mobileKeyboardAndOrientation(page, destination, screenshotPrefix) {
  await installViewportSimulation(page);
  for (const state of [{ height: 420, offsetTop: 0 }, { height: 420, offsetTop: 48 }, { height: 280, offsetTop: 24 }]) {
    await input(page, destination).evaluate(element => element.focus({ preventScroll: true }));
    await page.evaluate(next => window.__qaEditorVisualViewport(next), state);
    await settle(page);
    const measured = await makeToolbarReachable(page, destination, false);
    clearSeparation(measured, `${destination} keyboard ${state.height}/${state.offsetTop}`);
    await page.screenshot({ path: path.join(output, `${screenshotPrefix}-${destination}-keyboard-${state.height}-${state.offsetTop}.png`), animations: 'disabled' });
  }
  await page.evaluate(() => { delete window.visualViewport.height; delete window.visualViewport.offsetTop; });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { window.dispatchEvent(new Event('orientationchange')); window.dispatchEvent(new Event('resize')); });
  await settle(page);
  const landscape = await makeToolbarReachable(page, destination, true);
  clearSeparation(landscape, `${destination} rotation to landscape`);
  await page.screenshot({ path: path.join(output, `${screenshotPrefix}-${destination}-rotated.png`), animations: 'disabled' });
}

async function restoreSharedViewport(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await activate(page, 'cloud');
  await installViewportSimulation(page);
  await page.evaluate(() => window.__qaEditorVisualViewport({ height: 280, offsetTop: 24 }));
  await settle(page);
  await page.evaluate(() => window.history.pushState(null, '', '/cloud?tab=plaza&id=gone0001'));
  await view(page, 'share').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    delete window.visualViewport.height;
    delete window.visualViewport.offsetTop;
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await settle(page);
  const height = await page.locator('.cloud-page').evaluate(element => element.getBoundingClientRect().height);
  approx(height, 844, 'shared-card view restores its page height after the keyboard closes while both editors are hidden');
}

async function runSize(browser, engine, size) {
  const name = `${engine}-${size.width}x${size.height}`;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce', ...(size.mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Intercept all cloud endpoints, including mutations, so a failed selector cannot publish test content.
  await page.route('**/api/cloud**', route => {
    assert.equal(route.request().method(), 'GET', 'the editor regression must not send or delete content');
    if (new URL(route.request().url()).pathname === '/api/cloud/plaza') return route.fulfill({ json: { items: [], nextCursor: null, serverNow: new Date().toISOString() } });
    return route.fulfill({ status: 404, json: { error: 'Test endpoint disabled' } });
  });
  // Identity creation is outside this regression and should not touch the app's data files.
  await page.route('**/api/user', route => route.fulfill({ status: 503, json: { error: 'Identity is disabled in this regression' } }));
  const measurements = { name, baseline: {}, long: {}, attachments: {} };
  try {
    await page.goto(`${origin}/cloud`);
    await view(page, 'cloud').waitFor({ state: 'visible' });
    await settle(page);
    await page.evaluate(() => { window.__qaEditorNodes = {}; });
    for (const destination of ['cloud', 'plaza']) {
      await activate(page, destination);
      await input(page, destination).fill('');
      await input(page, destination).blur();
      await settle(page);
      const blank = await geometry(page, destination);
      if (size.height >= 600) approx(blank.input.height, 146, `${name}/${destination}: empty input retains the usual four-row height`);
      else assert.ok(blank.input.height <= 147 && blank.textarea.clientHeight >= blank.textarea.lineHeight, `${name}/${destination}: short viewport keeps at least one line within its normal initial height`);
      clearSeparation(blank, `${name}/${destination}: empty`);
      await input(page, destination).fill('短文\n第二行');
      await input(page, destination).blur();
      await settle(page);
      const short = await geometry(page, destination);
      if (size.height >= 600) approx(short.input.height, 146, `${name}/${destination}: short input retains the usual four-row height`);
      else assert.ok(short.input.height <= 147 && short.textarea.clientHeight >= short.textarea.lineHeight, `${name}/${destination}: short text adapts to a short viewport`);
      measurements.baseline[destination] = short;
      await input(page, destination).fill(longText);
      await input(page, destination).blur();
      await settle(page);
      assert.equal(await input(page, destination).inputValue(), normalized(longText));
      const long = await geometry(page, destination);
      internallyScrollable(long, `${name}/${destination}: CRLF long text`);
      await scrollTextToEnd(page, destination);
      await makeToolbarReachable(page, destination, size.height <= 420);
      measurements.long[destination] = await geometry(page, destination);
      await page.screenshot({ path: path.join(output, `${name}-${destination}-long.png`), animations: 'disabled' });
      await input(page, destination).fill(singleLine);
      await input(page, destination).blur();
      await settle(page);
      internallyScrollable(await geometry(page, destination), `${name}/${destination}: long unbroken URL`);
      await scrollTextToEnd(page, destination);
      await input(page, destination).fill(longText);
      await input(page, destination).blur();
      await settle(page);
      await expandedEditor(page, destination);
      const files = Array.from({ length: 28 }, (_, index) => ({ name: `attachment-${String(index).padStart(2, '0')}-abcdefghijklmnopqrstuvwxyz.txt`, mimeType: 'text/plain', buffer: Buffer.from(`file ${index}`) }));
      await panel(page, destination).locator('input[type="file"]').setInputFiles(files);
      await panel(page, destination).locator('.cloud-editor-attachments').waitFor();
      await settle(page);
      const expandFiles = panel(page, destination).getByRole('button', { name: /展开附件/ });
      await expandFiles.waitFor({ state: 'visible' });
      assert.equal(await panel(page, destination).locator('.cloud-editor-file-list:visible').count(), 0, `${name}/${destination}: many attachments initially collapse into a summary`);
      await makeToolbarReachable(page, destination, size.height <= 420);
      await expandFiles.click();
      await panel(page, destination).locator('.cloud-editor-file-list').waitFor({ state: 'visible' });
      await settle(page);
      const withExpandedFiles = await geometry(page, destination);
      assert.ok(withExpandedFiles.fileList, `${name}/${destination}: expanded attachments have their own bounded list`);
      assert.ok(withExpandedFiles.fileList.height <= 96, `${name}/${destination}: expanded attachment list is compact (about 80px maximum)`);
      assert.ok(withExpandedFiles.fileList.scrollHeight > withExpandedFiles.fileList.clientHeight, `${name}/${destination}: many attachments scroll within the list`);
      await panel(page, destination).locator('.cloud-editor-file-list').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await makeToolbarReachable(page, destination, size.height <= 420);
      await page.screenshot({ path: path.join(output, `${name}-${destination}-attachments-expanded.png`), animations: 'disabled' });
      await panel(page, destination).getByRole('button', { name: /收起附件/ }).click();
      await expandFiles.waitFor({ state: 'visible' });
      await settle(page);
      measurements.attachments[destination] = await makeToolbarReachable(page, destination, size.height <= 420);
      clearSeparation(measurements.attachments[destination], `${name}/${destination}: attachments`);
      await page.screenshot({ path: path.join(output, `${name}-${destination}-attachments.png`), animations: 'disabled' });
      await page.evaluate(destination => {
        window.__qaEditorNodes[destination] = document.querySelector(`[data-cloud-view="${destination}"] textarea`);
      }, destination);
    }
    equivalent(measurements.baseline.cloud, measurements.baseline.plaza, `${name}: short editor alignment`);
    equivalent(measurements.long.cloud, measurements.long.plaza, `${name}: long editor alignment`);
    equivalent(measurements.attachments.cloud, measurements.attachments.plaza, `${name}: attachment editor alignment`);
    for (const destination of ['cloud', 'plaza', 'cloud']) {
      await activate(page, destination);
      assert.equal(await page.evaluate(destination => window.__qaEditorNodes[destination] === document.querySelector(`[data-cloud-view="${destination}"] textarea`), destination), true, `${name}/${destination}: tab changes retain the original DOM textarea`);
      assert.equal(await input(page, destination).inputValue(), normalized(longText), `${name}/${destination}: tab changes keep the exact draft`);
      await panel(page, destination).getByRole('button', { name: /展开附件/ }).click();
      const lastFile = panel(page, destination).getByText('attachment-27-abcdefghijklmnopqrstuvwxyz.txt', { exact: true });
      assert.equal(await lastFile.count(), 1, `${name}/${destination}: tab changes preserve all attachments`);
      await panel(page, destination).getByRole('button', { name: /收起附件/ }).click();
      await settle(page);
    }
    if (size.mobile && size.width === 390) {
      for (const destination of ['cloud', 'plaza']) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await activate(page, destination);
        await mobileKeyboardAndOrientation(page, destination, name);
      }
      await restoreSharedViewport(page);
    }
    assert.deepEqual(errors, [], `${name}: no browser errors`);
    console.log(`PASS ${name}: bounded text, native scrolling, normal-flow actions, expanded edits, attachments and retained drafts`);
    return measurements;
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failure.png`), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const results = [];
  for (const engine of (process.env.PLAYWRIGHT_BROWSERS || 'chromium').split(',').map(value => value.trim()).filter(Boolean)) {
    assert.ok(['chromium', 'webkit'].includes(engine), `Unsupported test engine: ${engine}`);
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    try { for (const size of sizes) results.push(await runSize(browser, engine, size)); }
    finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} viewport/engine cases; screenshots and measurements: ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
