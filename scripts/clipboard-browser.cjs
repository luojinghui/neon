const assert = require('node:assert/strict');
const path = require('node:path');

/** Exercise actual editors; upload endpoints are mocked to avoid publishing test content. */
module.exports = async function testClipboard(page, url, output) {
  async function paste(selector, count = 1, htmlOnly = false) {
    return page.locator(selector).evaluate((element, { count, htmlOnly }) => {
      const data = new DataTransfer();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
      canvas.getContext('2d').fillRect(0, 0, 8, 8);
      const image = canvas.toDataURL('image/png');
      if (htmlOnly) data.setData('text/html', `<img src="${image}">`);
      else {
        const bytes = Uint8Array.from(atob(image.split(',')[1]), char => char.charCodeAt(0));
        for (let i = 0; i < count; i++) data.items.add(new File([bytes], `paste-${i}.png`, { type: 'image/png' }));
      }
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      element.dispatchEvent(event); return event.defaultPrevented;
    }, { count, htmlOnly });
  }

  let uploads = 0;
  await page.route('**/uploads/soul/abcdef01.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V6QAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/soul/upload', route => {
    uploads++;
    if (uploads === 1) return route.fulfill({ status: 503, json: { error: '测试上传失败' } });
    assert.equal(route.request().headers()['content-type'], 'image/png');
    return route.fulfill({ json: { url: '/uploads/soul/abcdef01.png', name: 'paste-1.png', size: 100, mimeType: 'image/png' } });
  });
  await page.goto(`${url}/soul/soul-harbor`);
  await page.getByRole('button', { name: '语音通话', exact: true }).waitFor();
  await page.getByRole('textbox', { name: '输入消息' }).fill('图片旁边的文字');
  assert.equal(await paste('textarea[aria-label="输入消息"]', 2), true);
  assert.equal(await page.getByLabel('待发送图片').locator('img').count(), 2);
  assert.equal(uploads, 0, 'pasting does not automatically send');
  await page.getByRole('button', { name: '移除图片 paste-0.png' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByText('测试上传失败', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('待发送图片').locator('img').count(), 1, 'failed uploads keep the draft');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByLabel('待发送图片').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="输入消息"]').value === '');
  await page.unroute('**/api/soul/upload');

  let cloudBody = '';
  await page.route('**/api/cloud', route => {
    cloudBody = route.request().postData() || '';
    return route.fulfill({ json: { state: 200, data: { password: 'Q7YZ' } } });
  });
  await page.goto(`${url}/cloud`);
  await page.getByRole('textbox', { name: '发送内容' }).fill('云传图文');
  assert.equal(await paste('textarea[aria-label="发送内容"]', 1, true), true);
  await page.locator('.cloud-editor img').waitFor();
  assert.equal(await page.getByRole('textbox', { name: '发送内容' }).inputValue(), '云传图文');
  await page.screenshot({ path: path.join(output, 'clipboard-cloud.png') });
  await page.locator('.cloud-send-button').click();
  await page.locator('.cloud-editor img').waitFor({ state: 'hidden' });
  assert.match(cloudBody, /image\/png/); assert.match(cloudBody, /filename=/);
  await page.unroute('**/api/cloud');

  let momentBody = '';
  await page.route('**/api/moments*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 12, hasMore: false, isAdmin: false } });
    momentBody = route.request().postData() || '';
    return route.fulfill({ json: { item: { id: 'paste-test', text: '心迹图文', media: [], voice: null, location: null, author: { userId: 'test', name: '测试', avatarUrl: '', publicKey: '', isSystem: false }, comments: [], commentCount: 0, likeCount: 0, liked: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOwner: true, canDelete: true } } });
  });
  await page.goto(`${url}/moments`);
  await page.getByRole('button', { name: /发布心迹/ }).first().click();
  const textarea = page.locator('.moment-composer-text textarea');
  await textarea.fill('心迹图文'); await textarea.focus();
  assert.equal(await textarea.evaluate(element => getComputedStyle(element).boxShadow), 'none');
  assert.equal(await paste('.moment-composer-text textarea', 10), true);
  assert.equal(await page.locator('.moment-file-preview').count(), 9);
  await page.getByText('每条心迹最多添加 9 个图片或视频', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'clipboard-moments.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.locator('.moment-composer').waitFor({ state: 'hidden' });
  assert.equal((momentBody.match(/filename=/g) || []).length, 9);
  await page.unroute('**/api/moments*');
  console.log('PASS cloud/chat/moments pasted image preview, send, retry, limits and border-only focus');
};
