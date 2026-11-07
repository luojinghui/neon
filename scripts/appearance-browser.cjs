// Run against a local dev server. No content is submitted or changed.
// APPEARANCE_QA_URL, PLAYWRIGHT_MODULE_PATH and optional CHROMIUM_EXECUTABLE_PATH
// support local runtimes; APPEARANCE_QA_ENGINES defaults to chromium,webkit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.APPEARANCE_QA_URL || 'http://127.0.0.1:3000';
const output = path.resolve('.cache/appearance-qa');
fs.mkdirSync(output, { recursive: true });
const skins = [['orange', '暖橘'], ['blue', '晴蓝'], ['violet', '鸢紫'], ['green', '松青'], ['rose', '蔷薇']];

async function geometry(tabs) {
  return tabs.evaluate(track => {
    const selected = track.querySelector('[aria-selected="true"]');
    const indicator = track.querySelector(':scope > [aria-hidden="true"]');
    const tab = selected.getBoundingClientRect(), thumb = indicator.getBoundingClientRect();
    return { offset: Math.abs(tab.left - thumb.left), width: Math.abs(tab.width - thumb.width), background: getComputedStyle(selected).backgroundColor };
  });
}
async function aligned(tabs) {
  // Wait for selection transitions, while preserving Popover's real scale animation.
  await tabs.evaluate(async track => {
    const root = track.closest('[data-placement]') || track;
    await Promise.all(root.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  const result = await geometry(tabs);
  assert.ok(result.offset <= 1 && result.width <= 1, `thumb must match selected tab: ${JSON.stringify(result)}`);
  assert.equal(result.background, 'rgba(0, 0, 0, 0)', 'a transparent tab must not cover the glass indicator');
}
async function syncBackground(page) {
  await page.waitForFunction(() => {
    const background = getComputedStyle(document.documentElement).backgroundColor;
    return [...document.querySelectorAll('meta[name="theme-color"]')].every(meta => meta.content === background);
  });
  return page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
  }));
}
async function check(browser, engine, width) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/uikit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: '外观设置', exact: true }).waitFor();
    await page.evaluate(() => { localStorage.setItem('theme', 'light'); localStorage.setItem('neon:skin', 'green'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const trigger = page.getByRole('button', { name: '外观设置', exact: true });
    await trigger.click();
    const tabs = page.getByRole('tablist', { name: '外观模式', exact: true }).last();
    await tabs.waitFor();
    await aligned(tabs);
    const popup = page.locator('[data-placement]').filter({ has: tabs });
    const bounds = await popup.boundingBox();
    assert.ok(bounds.x >= 11 && bounds.x + bounds.width <= width - 11, 'appearance popup keeps mobile gutters');

    for (const [mode, label] of [['light', '浅色'], ['dark', '深色']]) {
      await tabs.getByRole('tab', { name: label, exact: true }).click();
      const backgrounds = new Set();
      let surface;
      for (const [skin, name] of skins) {
        await popup.getByRole('radio', { name, exact: true }).click();
        await page.waitForFunction(skin => document.documentElement.dataset.skin === skin, skin);
        const colors = await syncBackground(page);
        assert.equal(colors.root, colors.body, 'page and body share their skin background');
        if (surface) assert.equal(colors.surface, surface, 'card surface stays neutral');
        surface = colors.surface;
        backgrounds.add(colors.root);
        await aligned(tabs);
        if (skin === 'green') await page.screenshot({ path: path.join(output, `${engine}-${width}-${mode}.png`) });
      }
      assert.equal(backgrounds.size, skins.length, 'each skin has its own page tint');
    }
    // Keyboard changes mode and leaves the focus ring visible inside the tab.
    await tabs.getByRole('tab', { name: '深色', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tabs.getByRole('tab', { name: '浅色', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await tabs.getByRole('tab', { name: '浅色', exact: true }).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await aligned(tabs);
    await tabs.getByRole('tab', { name: '自动', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await syncBackground(page);
    await page.keyboard.press('Escape');

    // Local opposite modes and skin boundaries must also reach the portal.
    await page.getByRole('group', { name: '主题色切换', exact: true }).getByRole('button', { name: '晴蓝', exact: true }).click();
    for (const [mode, label] of [['light', '浅色'], ['dark', '深色']]) {
      const localTrigger = page.getByRole('button', { name: `${label}范围浮层`, exact: true });
      await localTrigger.click();
      const localTabs = page.getByRole('tablist', { name: `${mode}浮层选项`, exact: true });
      await aligned(localTabs);
      const triggerTheme = await localTrigger.evaluate(el => ({ background: getComputedStyle(el).getPropertyValue('--background').trim(), scheme: getComputedStyle(el).colorScheme }));
      const popupTheme = await localTabs.evaluate(el => ({ background: getComputedStyle(el).getPropertyValue('--background').trim(), scheme: getComputedStyle(el).colorScheme }));
      assert.deepEqual(popupTheme, triggerTheme);
      assert.equal(popupTheme.scheme, mode);
      assert.equal(await localTabs.getByRole('tab', { name: '禁用', exact: true }).isDisabled(), true);
      // Hold the popup at its real entrance scale to exercise pointer-to-layout
      // conversion without depending on animation timing or machine speed.
      await localTabs.evaluate(track => {
        const motion = track.closest('.xy-popover-content');
        motion.style.transition = 'none';
        motion.style.transform = 'scale(.8)';
      });
      await localTabs.getByRole('tab', { name: '第二项', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await localTabs.getByRole('tab', { name: '第一项', exact: true }).getAttribute('aria-selected'), 'true', 'keyboard skips disabled tab');
      await aligned(localTabs);
      if (!mobile) {
        const first = await localTabs.getByRole('tab', { name: '第一项', exact: true }).boundingBox();
        const second = await localTabs.getByRole('tab', { name: '第二项', exact: true }).boundingBox();
        await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
        await page.mouse.down();
        await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 8 });
        await page.mouse.up();
        assert.equal(await localTabs.getByRole('tab', { name: '第二项', exact: true }).getAttribute('aria-selected'), 'true');
        await aligned(localTabs);
      }
      await page.keyboard.press('Escape');
    }
    assert.equal(await page.getByRole('button', { name: '加载中', exact: true }).first().isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '禁用', exact: true }).first().isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');

    await page.goto(`${origin}/cloud`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), 'rose', 'skin persists across pages');
    // Reproduce a late Next metadata replacement after navigation/hydration.
    await page.evaluate(() => {
      const meta = document.querySelector('meta[name="theme-color"]');
      const replacement = meta.cloneNode();
      replacement.content = '#fbf9f7';
      meta.replaceWith(replacement);
    });
    await syncBackground(page);
    await page.getByRole('button', { name: '外观设置', exact: true }).click();
    await aligned(page.getByRole('tablist', { name: '外观模式', exact: true }));
    await page.screenshot({ path: path.join(output, `${engine}-${width}-cloud.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${width}px: appearance geometry, 5 skins × 2 modes, browser chrome, local portals, keyboard, disabled/loading, persistence`);
  } finally { await context.close(); }
}
(async () => {
  for (const engine of (process.env.APPEARANCE_QA_ENGINES || 'chromium,webkit').split(',')) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
    try {
      for (const width of [390, 320, 1280]) await check(browser, engine, width);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
