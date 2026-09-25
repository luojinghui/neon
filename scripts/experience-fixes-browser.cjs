const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function testExperienceFixes(host, guest, url, output, waitFor) {
  await waitFor(() => host.locator('.soul-call-notice').count().then(count => count === 0), 'previous call has ended');
  await host.getByRole('button', { name: '视频通话', exact: true }).click();
  await host.getByRole('button', { name: '挂断通话', exact: true }).waitFor();
  await host.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
  await host.getByRole('textbox', { name: '输入消息', exact: true }).fill('保留这个草稿');
  await host.evaluate(() => {
    window.__composerFrames = [];
    const until = performance.now() + 1200;
    const sample = () => {
      window.__composerFrames.push({ top: document.querySelector('textarea[aria-label="输入消息"]').getBoundingClientRect().top, notice: Boolean(document.querySelector('.soul-call-notice')), overflow: document.body.style.overflow });
      if (performance.now() < until) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await host.getByRole('button', { name: '挂断通话', exact: true }).click();
  await waitFor(() => host.evaluate(() => window.__composerFrames.length > 30), 'composer frame samples');
  const frames = await host.evaluate(() => window.__composerFrames);
  assert.ok(frames.every(frame => !frame.notice && frame.overflow !== 'hidden'), 'hangup never flashes an obsolete call notice or scroll lock');
  assert.ok(Math.max(...frames.map(frame => frame.top)) - Math.min(...frames.map(frame => frame.top)) < 1, 'chat composer stays in place during mini hangup');
  assert.equal(await host.getByRole('textbox', { name: '输入消息', exact: true }).inputValue(), '保留这个草稿');
  assert.equal(await host.evaluate(() => window.__microphones.every(mic => mic.context.state === 'closed')), true);

  await host.getByRole('textbox', { name: '输入消息', exact: true }).fill('一键撤回回归验证');
  await host.getByRole('button', { name: '发送', exact: true }).click();
  const recalled = host.locator('article').filter({ has: host.getByText('一键撤回回归验证', { exact: true }) });
  await recalled.getByRole('button', { name: '更多操作', exact: true }).click();
  await host.getByRole('button', { name: /撤回/ }).click();
  await recalled.waitFor({ state: 'hidden' });
  assert.equal(await host.getByText('撤回这条消息？', { exact: true }).count(), 0);

  await host.getByRole('button', { name: '聊天室小游戏', exact: true }).click();
  await host.getByRole('button', { name: /你画我猜.*画出脑洞/ }).click();
  await host.getByPlaceholder('输入你的谜底').fill('向日葵');
  const canvas = host.locator('.ant-modal canvas');
  await host.locator('.ant-modal').evaluate(async modal => { await Promise.all(modal.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))); });
  await canvas.click({ position: { x: 100, y: 100 } });
  await host.getByRole('button', { name: /发起你画我猜/ }).click();
  await guest.getByRole('button', { name: '参与猜画', exact: true }).click();
  await guest.getByRole('textbox', { name: '你的猜测', exact: true }).fill('小猫咪');
  await guest.getByRole('button', { name: '猜一下', exact: true }).click();
  await guest.getByLabel('最近的猜测').getByText(/小猫咪/).waitFor();
  await new Promise(resolve => setTimeout(resolve, 850)); // Respect the server's 800 ms guess interval.
  await guest.getByRole('textbox', { name: '你的猜测', exact: true }).fill('向日葵');
  await guest.getByRole('button', { name: '猜一下', exact: true }).click();
  await guest.getByLabel('猜测结果').waitFor();
  assert.match(await guest.getByLabel('猜测结果').innerText(), /小猫咪.*未猜中/s);
  assert.match(await guest.getByLabel('猜测结果').innerText(), /向日葵.*正确/s);
  await guest.screenshot({ path: path.join(output, 'drawing-results.png') });
  await guest.keyboard.press('Escape');
  console.log('PASS mini hangup has stable composer geometry, releases audio, recalls once and shows per-person drawing results');

  const moment = { id: 'cache-regression', text: '缓存里的心迹', media: [], voice: null, location: null, author: { userId: 'test', name: '测试', avatarUrl: '', publicKey: '', isSystem: false }, comments: [], commentCount: 0, likeCount: 0, liked: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOwner: true, canDelete: true };
  let delay = false, offline = false, release;
  await host.route('**/api/moments?*', async route => {
    if (delay) await new Promise(resolve => { release = resolve; });
    if (offline) return route.abort();
    return route.fulfill({ json: { items: [moment], total: 1, page: 1, pageSize: 12, hasMore: false, isAdmin: false } });
  });
  await host.goto(`${url}/moments`);
  await host.getByText('缓存里的心迹', { exact: true }).waitFor();
  await host.getByRole('link', { name: '返回首页', exact: true }).click();
  delay = true;
  await host.getByRole('link', { name: /心迹/ }).click();
  await host.getByText('缓存里的心迹', { exact: true }).waitFor();
  assert.equal(await host.getByLabel('正在加载心迹').count(), 0, 'route return renders cached data while the network is pending');
  await waitFor(() => Boolean(release), 'quiet refresh pending');
  moment.text = '远端更新的心迹'; release(); delay = false;
  await host.getByText('远端更新的心迹', { exact: true }).waitFor();
  offline = true;
  await host.reload();
  await host.getByText('远端更新的心迹', { exact: true }).waitFor();
  assert.equal(await host.getByText('心迹加载失败', { exact: true }).count(), 0, 'persistent cache survives a failed quiet refresh');
  await host.unroute('**/api/moments?*');
  console.log('PASS moments restores memory/disk cache without loading flashes and silently updates remote content');

  await host.goto(`${url}/doodle`);
  const theme = host.getByRole('button', { name: /^当前：/ });
  await theme.waitFor();
  for (let attempt = 0; attempt < 3 && !(await theme.getAttribute('aria-label')).startsWith('当前：深色模式'); attempt++) await theme.click();
  await waitFor(() => host.evaluate(() => document.documentElement.classList.contains('dark')), 'camera dark theme');
  const label = host.getByText('笑一下，咔嚓！', { exact: true });
  assert.equal(await label.evaluate(element => getComputedStyle(element).color), 'rgb(32, 26, 23)');
  await host.screenshot({ path: path.join(output, 'camera-welcome-dark.png'), animations: 'disabled' });
  const png = await host.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 960;
    const context = canvas.getContext('2d'); context.fillStyle = '#e8cdb5'; context.fillRect(0, 0, 720, 960);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await host.locator('input[type=file]').setInputFiles({ name: 'portrait-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await host.getByRole('progressbar', { name: '角色生成进度', exact: true }).waitFor();
  await host.evaluate(() => {
    window.__portraitProgress = [];
    const observer = new MutationObserver(() => {
      const value = document.querySelector('[aria-label="角色生成进度"]')?.getAttribute('aria-valuenow');
      if (value !== undefined && value !== null) window.__portraitProgress.push(Number(value));
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-valuenow'] });
    window.__portraitProgressObserver = observer;
  });
  await host.screenshot({ path: path.join(output, 'camera-progress.png') });
  await host.locator('.portrait-controls').waitFor({ timeout: 120000 });
  const values = await host.evaluate(() => { window.__portraitProgressObserver.disconnect(); return window.__portraitProgress; });
  assert.ok(values.length > 1 && values.every((value, index) => value >= 0 && value <= 100 && (!index || value >= values[index - 1])), 'progress follows monotonically increasing processing stages');
  assert.equal(values.at(-1), 100, 'only completes once the result is ready');
  console.log('PASS camera dark contrast and real portrait processing progress');
  await host.goto(`${url}/soul/soul-harbor`);
  await waitFor(() => host.getByRole('button', { name: '视频通话', exact: true }).isEnabled(), 'return to room');
};
