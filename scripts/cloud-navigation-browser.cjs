// Run against an isolated app server: CLOUD_QA_URL=http://127.0.0.1:3000 node scripts/cloud-navigation-browser.cjs
// Content endpoints are mocked: this regression never publishes or deletes real messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const origin = new URL(process.env.CLOUD_QA_URL || 'http://127.0.0.1:3000').origin;
const output = path.resolve(process.env.CLOUD_QA_OUTPUT || '.cache/cloud-navigation-qa');
fs.mkdirSync(output, { recursive: true });
const shortId = 'Ab_cd-12';
const legacyId = 'a'.repeat(32);
const now = () => new Date().toISOString();
const item = (messageId = shortId) => ({ messageId, content: `分享内容 ${messageId}`, files: [], createdAt: now(), expireAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() });
const view = (page, name) => page.locator(`[data-cloud-view="${name}"]`);
const editor = (page, name) => view(page, name).getByRole('textbox', { name: '发送内容', exact: true });
const tab = (page, name) => page.getByRole('navigation', { name: '云传导航' }).getByRole('link', { name, exact: true });

async function fixture(browser, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const requests = { list: 0, detail: [], password: [], navigations: [] };
  let retryAttempts = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/cloud') && (request.resourceType() === 'document' || request.headers().rsc || url.searchParams.has('_rsc'))) requests.navigations.push(request.url());
  });
  await page.route('**/api/cloud/plaza**', route => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(request.method(), 'GET', 'this regression must not mutate a real endpoint');
    if (url.pathname === '/api/cloud/plaza') {
      requests.list++;
      return route.fulfill({ json: { items: [item()], nextCursor: null, serverNow: now() } });
    }
    const id = decodeURIComponent(url.pathname.split('/').pop());
    requests.detail.push(id);
    if (id === 'gone0001') return route.fulfill({ status: 404, json: { error: '内容已过期或被删除' } });
    if (id === 'retry001' && retryAttempts++ === 0) return route.fulfill({ status: 503, json: { error: '测试网络故障' } });
    return route.fulfill({ json: { item: item(id), serverNow: now() } });
  });
  await page.route('**/api/cloud?*', route => {
    assert.equal(route.request().method(), 'GET');
    const password = new URL(route.request().url()).searchParams.get('password');
    requests.password.push(password);
    return route.fulfill({ json: { state: 200, message: 'ok', data: { text: `密码内容 ${password}`, files: [] } } });
  });
  return { context, page, errors, requests };
}

async function waitForView(page, name) {
  await view(page, name).waitFor({ state: 'visible' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function geometry(page, name) {
  return view(page, name).locator('.cloud-editor').evaluate(panel => {
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    };
    const card = bounds(panel);
    const toolbar = bounds(panel.querySelector('.cloud-editor-toolbar'));
    const buttons = [...panel.querySelectorAll('.cloud-editor-toolbar button')].map(bounds);
    const lastButtonBottom = Math.max(...buttons.map(button => button.bottom));
    return {
      card, input: bounds(panel.querySelector('textarea')), heading: bounds(panel.querySelector('.cloud-editor-heading')), toolbar,
      bottomInset: card.bottom - lastButtonBottom,
      sideInset: buttons[0].x - card.x,
      pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth
    };
  });
}

function aligned(cloud, plaza, width) {
  for (const part of ['card', 'input', 'heading', 'toolbar']) {
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(cloud[part][key] - plaza[part][key]) <= 1, `${width}px ${part}.${key}: cloud=${cloud[part][key]}, plaza=${plaza[part][key]}`);
    }
  }
  for (const [name, value] of [['cloud', cloud], ['plaza', plaza]]) {
    assert.ok(Math.abs(value.bottomInset - value.sideInset) <= 1, `${width}px ${name} footer inset matches panel side inset: ${JSON.stringify(value)}`);
    assert.ok(value.pageWidth <= value.viewportWidth, `${width}px ${name} has no horizontal overflow`);
  }
}

async function layoutAndNavigation(browser, width) {
  const { context, page, errors, requests } = await fixture(browser, { width, height: width > 640 ? 1000 : 844 });
  try {
    await page.goto(`${origin}/cloud`);
    await waitForView(page, 'cloud');
    assert.equal(requests.list, 0, 'cloud arrival does not load the plaza');
    const cloud = await geometry(page, 'cloud');
    await page.screenshot({ path: path.join(output, `cloud-${width}.png`), animations: 'disabled' });
    await page.evaluate(() => {
      window.__qaCloudEditor = document.querySelector('[data-cloud-view="cloud"] textarea');
      window.__qaShell = document.querySelector('.cloud-page');
    });
    const navigationCount = requests.navigations.length;
    await editor(page, 'cloud').fill('云传草稿');
    await view(page, 'cloud').locator('input[type="file"]').setInputFiles({ name: 'cloud-draft.txt', mimeType: 'text/plain', buffer: Buffer.from('cloud attachment') });
    await tab(page, '广场').click();
    await waitForView(page, 'plaza');
    await view(page, 'plaza').getByText(`分享内容 ${shortId}`, { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/cloud');
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'plaza');
    assert.equal(requests.list, 1, 'first plaza activation loads its feed once');
    const plaza = await geometry(page, 'plaza');
    aligned(cloud, plaza, width);
    const refresh = view(page, 'plaza').getByRole('button', { name: '刷新广场', exact: true });
    assert.equal((await refresh.textContent()).trim(), '', 'refresh presents only its icon');
    assert.ok(!(await view(page, 'plaza').innerText()).includes('公开可见'), 'plaza copy omits redundant public visibility rules');
    await page.screenshot({ path: path.join(output, `plaza-${width}.png`), animations: 'disabled' });
    await editor(page, 'plaza').fill('广场草稿');
    await view(page, 'plaza').locator('input[type="file"]').setInputFiles({ name: 'plaza-draft.txt', mimeType: 'text/plain', buffer: Buffer.from('plaza attachment') });
    await page.evaluate(() => { window.__qaPlazaEditor = document.querySelector('[data-cloud-view="plaza"] textarea'); });
    await tab(page, '云传').click();
    await waitForView(page, 'cloud');
    assert.equal(await editor(page, 'cloud').inputValue(), '云传草稿');
    await view(page, 'cloud').getByText('cloud-draft.txt', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__qaCloudEditor === document.querySelector('[data-cloud-view="cloud"] textarea')), true);
    await page.goBack();
    await waitForView(page, 'plaza');
    assert.equal(await editor(page, 'plaza').inputValue(), '广场草稿');
    await view(page, 'plaza').getByText('plaza-draft.txt', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__qaPlazaEditor === document.querySelector('[data-cloud-view="plaza"] textarea')), true);
    await page.goForward();
    await waitForView(page, 'cloud');
    await tab(page, '广场').click();
    await waitForView(page, 'plaza');
    assert.equal(requests.list, 1, 'returning to the plaza reuses its loaded feed');
    assert.equal(requests.navigations.length, navigationCount, 'tab switches and browser history make no document or RSC requests');
    assert.equal(await page.evaluate(() => window.__qaShell === document.querySelector('.cloud-page')), true, 'tab changes preserve the page shell');
    await refresh.click();
    await page.waitForFunction(() => !document.querySelector('[data-cloud-view="plaza"] .plaza-feed-heading button').classList.contains('ant-btn-loading'));
    assert.equal(requests.list, 2, 'manual refresh is explicit');
    assert.equal(await editor(page, 'plaza').inputValue(), '广场草稿', 'manual refresh keeps the draft');
    await view(page, 'plaza').locator('.plaza-card-actions').getByRole('button', { name: /分享/ }).first().click();
    const shareLink = page.getByRole('textbox', { name: '卡片分享链接' });
    await shareLink.waitFor();
    assert.equal(await shareLink.inputValue(), `${origin}/cloud?tab=plaza&id=${shortId}`);
    const duplicateIds = await page.evaluate(() => {
      const seen = new Set();
      return [...document.querySelectorAll('[id]')].map(element => element.id).filter(id => seen.has(id) || !seen.add(id));
    });
    assert.deepEqual(duplicateIds, [], 'mounted editors retain unique accessible heading IDs');
    assert.deepEqual(errors, []);
    return { width, cloud, plaza };
  } finally { await context.close(); }
}

async function sharingAndLegacyLinks(browser) {
  const { context, page, requests, errors } = await fixture(browser);
  try {
    await page.goto(`${origin}/cloud?tab=plaza&id=${shortId}`);
    await waitForView(page, 'share');
    await view(page, 'share').getByText(`分享内容 ${shortId}`, { exact: true }).waitFor();
    assert.equal(requests.detail.at(-1), shortId);
    assert.equal(requests.list, 0, 'a shared card loads its detail without fetching the feed');
    await page.screenshot({ path: path.join(output, 'share-short-id.png'), animations: 'disabled' });
    await tab(page, '广场').click();
    await waitForView(page, 'plaza');
    assert.equal(new URL(page.url()).searchParams.has('id'), false, 'the plaza tab leaves shared-card mode');
    await page.goto(`${origin}/cloud/plaza`);
    await waitForView(page, 'plaza');
    assert.equal(page.url(), `${origin}/cloud?tab=plaza`, 'previous plaza path redirects to its query parameter');
    await page.goto(`${origin}/cloud/plaza/${legacyId}`);
    await waitForView(page, 'share');
    await view(page, 'share').getByText(`分享内容 ${legacyId}`, { exact: true }).waitFor();
    assert.equal(page.url(), `${origin}/cloud?tab=plaza&id=${legacyId}`, 'previous shared links retain their legacy IDs');
    const detailCount = requests.detail.length;
    await page.goto(`${origin}/cloud?tab=plaza&id=invalid`);
    await view(page, 'share').getByRole('heading', { name: '分享链接无效' }).waitFor();
    assert.equal(requests.detail.length, detailCount, 'invalid IDs are rejected before an API request');
    await page.goto(`${origin}/cloud?tab=plaza&id=gone0001`);
    await view(page, 'share').getByRole('heading', { name: '内容已过期或被删除' }).waitFor();
    await page.goto(`${origin}/cloud?tab=plaza&id=retry001`);
    await view(page, 'share').getByRole('heading', { name: '暂时无法加载' }).waitFor();
    await view(page, 'share').getByRole('button', { name: /重试$/ }).click();
    await view(page, 'share').getByText('分享内容 retry001', { exact: true }).waitFor();
    assert.equal(requests.detail.filter(id => id === 'retry001').length, 2, 'retry reloads the same shared message');
    await page.goto(`${origin}/cloud?pwd=ab`);
    await waitForView(page, 'cloud');
    await page.waitForFunction(() => document.querySelector('[data-cloud-view="cloud"] textarea').value === '密码内容 ab');
    assert.equal(requests.password.at(-1), 'ab', 'existing cloud password links keep working');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const measurements = [];
    for (const width of [1440, 390, 320]) {
      measurements.push(await layoutAndNavigation(browser, width));
      console.log(`PASS ${width}px layout, tab navigation, draft/file retention and sharing`);
    }
    await sharingAndLegacyLinks(browser);
    fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
    console.log('PASS query-parameter tabs, preserved editor DOM/drafts/files, browser history, short-ID sharing, legacy links, retry and 1440/390/320px layout alignment');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
