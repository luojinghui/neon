// Run after pnpm build. Uses isolated data, mocked permission/subscription APIs,
// and a mock push transport. Never sends a notification to a real browser user.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createECDH, randomBytes } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { PushRepository } = require('../src/server/push/repository');
const webpush = require('web-push');

async function waitFor(check, label) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    try { if (await check()) return; } catch { /* Wait for server/data readiness. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out: ${label}`);
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-push-browser-'));
  const output = path.join(root, '.cache/push-qa'); fs.mkdirSync(output, { recursive: true });
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const dataFile = path.join(directory, 'push.json');
  const profileFile = path.join(directory, 'profiles.json');
  const env = { ...process.env, NODE_ENV: 'production', APP_PORT: String(port), APP_HOST: '127.0.0.1', MONGODB_URI: '', MCP_ENABLED: 'false', USER_PROFILE_DATA_FILE: profileFile, WEB_PUSH_DATA_FILE: dataFile, WEB_PUSH_VAPID_PUBLIC_KEY: '', WEB_PUSH_VAPID_PRIVATE_KEY: '', SOUL_CHAT_DATA_FILE: path.join(directory, 'chat.json'), MOMENT_DATA_FILE: path.join(directory, 'moments.json'), DOODLE_REVIEW_DATA_FILE: path.join(directory, 'reviews.json'), DOODLE_SHARE_DATA_FILE: path.join(directory, 'shares.json') };
  const server = spawn(process.execPath, ['src/server.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
  let browser;
  try {
    await waitFor(async () => (await fetch(`${base}/healthz`)).ok, 'isolated server');
    browser = await chromium.launch({ headless: true, ...(process.env.PUSH_BROWSER_EXECUTABLE ? { executablePath: process.env.PUSH_BROWSER_EXECUTABLE } : {}) });
    const key = createECDH('prime256v1'); key.generateKeys();
    const subscription = { endpoint: 'https://fcm.googleapis.com/send/browser-fixture', expirationTime: null, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, userAgent: 'Neon Push QA Browser/1.0' });
    const errors = [];
    let page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(({ subscription }) => {
      window.__pushPermissionCalls = 0;
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => localStorage.getItem('__qaPermission') || 'default' });
      Notification.requestPermission = async () => {
        window.__pushPermissionCalls++;
        window.__pushActivation = navigator.userActivation.isActive;
        localStorage.setItem('__qaPermission', 'granted'); return 'granted';
      };
      let existing = null;
      PushManager.prototype.getSubscription = async () => existing;
      PushManager.prototype.subscribe = async options => {
        existing = { ...subscription, options, toJSON: () => subscription, unsubscribe: async () => { existing = null; return true; } };
        return existing;
      };
    }, { subscription });
    await page.goto(`${base}/cloud`);
    await page.getByRole('button', { name: '开启通知', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__pushPermissionCalls), 0);
    await page.screenshot({ path: path.join(output, 'prompt-desktop.png') });
    await page.getByRole('button', { name: '开启通知', exact: true }).click();
    await waitFor(() => fs.existsSync(dataFile) && JSON.parse(fs.readFileSync(dataFile)).subscriptions.length === 1, 'subscription sync');
    assert.equal(await page.evaluate(() => window.__pushPermissionCalls), 1);
    assert.equal(await page.evaluate(() => window.__pushActivation), true);
    const profiles = () => JSON.parse(fs.readFileSync(profileFile)).profiles;
    assert.equal(profiles()[0].userAgent, 'Neon Push QA Browser/1.0');
    const publicProfile = await (await fetch(`${base}/api/user`, { headers: { 'x-neon-user-uuid': profiles()[0].uuid } })).json();
    assert.equal('userAgent' in publicProfile.profile, false);
    await page.goto(`${base}/moments`);
    await waitFor(async () => await page.evaluate(() => !!navigator.serviceWorker.controller), 'shared service worker');
    assert.equal(await page.evaluate(() => window.__pushPermissionCalls), 0);
    await page.goto(`${base}/soul`);
    assert.equal(await page.getByRole('button', { name: '开启通知', exact: true }).count(), 0);

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobile.addInitScript(() => { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' }); });
    const small = await mobile.newPage();
    await small.goto(`${base}/soul`);
    await small.getByRole('button', { name: '暂不开启', exact: true }).waitFor();
    await small.screenshot({ path: path.join(output, 'prompt-mobile.png') });
    const rect = await small.getByRole('complementary', { name: '消息通知' }).boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
    await small.getByRole('button', { name: '暂不开启', exact: true }).click();
    await small.goto(`${base}/moments`);
    await small.waitForLoadState('networkidle');
    assert.equal(await small.getByRole('button', { name: '开启通知', exact: true }).count(), 0);
    await mobile.close();

    const denied = await browser.newContext();
    await denied.addInitScript(() => {
      window.__permissionCalls = 0;
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'denied' });
      Notification.requestPermission = async () => { window.__permissionCalls++; return 'denied'; };
    });
    const deniedPage = await denied.newPage();
    await deniedPage.goto(`${base}/cloud`);
    await deniedPage.waitForLoadState('networkidle');
    assert.equal(await deniedPage.getByRole('button', { name: '开启通知', exact: true }).count(), 0);
    assert.equal(await deniedPage.evaluate(() => window.__permissionCalls), 0);
    await denied.close();

    const repository = new PushRepository({ dataFile, env: {}, transport: { generateVAPIDKeys: webpush.generateVAPIDKeys, sendNotification: async () => {} } });
    const sent = [];
    // Browser request routing cannot intercept requests handled by a controlling SW.
    // Admin UI fixtures use a separate context; the real public flow above keeps SW enabled.
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    page = await adminContext.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/admin/**', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname === '/api/admin/session') return route.fulfill({ json: { admin: { id: 'fixture', username: 'qa', displayName: '测试管理员', role: 'super_admin' } } });
      if (url.pathname === '/api/admin/users') return route.fulfill({ json: { items: profiles() } });
      if (url.pathname === '/api/admin/push') return route.fulfill({ json: await repository.dashboard(profiles()) });
      if (url.pathname === '/api/admin/push/messages') {
        assert.equal(request.headers()['x-admin-request'], '1');
        sent.push(request.postDataJSON());
        return route.fulfill({ status: 201, json: { item: await repository.send(request.postDataJSON(), profiles(), 'qa') } });
      }
      return route.fulfill({ json: { items: [], total: 0, stats: {} } });
    });
    await page.goto(`${base}/admin`);
    await page.getByRole('button', { name: '人员数据' }).click();
    await page.getByRole('cell', { name: 'Neon Push QA Browser/1.0', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'admin-users.png') });
    await page.getByRole('button', { name: '消息推送' }).click();
    await page.getByRole('button', { name: '选择推送', exact: true }).first().click();
    await page.getByPlaceholder('输入通知标题').fill('星球更新');
    await page.getByPlaceholder('输入通知内容').fill('点击查看新的星球消息');
    await page.locator('#push-target-url').fill('/soul?from=push');
    await page.getByRole('button', { name: '预览并发送' }).click();
    await page.getByRole('button', { name: '发送至 1 个浏览器', exact: true }).waitFor();
    await page.waitForTimeout(350); // Let the modal's entrance motion finish for visual QA.
    await page.screenshot({ path: path.join(output, 'admin-push-preview.png') });
    await page.getByRole('button', { name: '发送至 1 个浏览器', exact: true }).click();
    await page.getByText('推送服务已接收 1 / 1 条，失败 0 条', { exact: true }).waitFor();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, '/soul?from=push');
    await page.screenshot({ path: path.join(output, 'admin-push.png'), animations: 'disabled', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Browser QA passed: registration UA, permission gesture, subscription sync, prompt snooze, mobile layout and admin push workflow.');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) {
      console.error(`QA page: ${page.url()}\n${(await page.locator('body').innerText().catch(() => '')).slice(0, 1600)}`);
      await page.screenshot({ path: path.join(output, `failure-${browser.contexts().indexOf(context)}.png`) }).catch(() => {});
    }
    console.error(logs.slice(-4000)); throw error;
  }
  finally {
    await browser?.close();
    server.kill(); await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
