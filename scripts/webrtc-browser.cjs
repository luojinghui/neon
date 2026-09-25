// Run after pnpm build. Requires Playwright (or PLAYWRIGHT_MODULE_PATH).
// Uses isolated temporary server data and synthetic browser devices, never real capture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function waitFor(check, label, timeout = 30000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out: ${label}${last ? `: ${last.message}` : ''}`);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-webrtc-browser-'));
  const output = path.resolve('.cache/webrtc-qa'); fs.mkdirSync(output, { recursive: true });
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', APP_PORT: String(port), APP_HOST: '127.0.0.1',
      SOUL_CHAT_DATA_FILE: path.join(directory, 'chat.json'), USER_PROFILE_DATA_FILE: path.join(directory, 'profiles.json'),
      DOODLE_REVIEW_DATA_FILE: path.join(directory, 'reviews.json'), DOODLE_SHARE_DATA_FILE: path.join(directory, 'shares.json'),
      MOMENT_DATA_FILE: path.join(directory, 'moments.json'), DOODLE_REVIEW_UPLOAD_DIRECTORY: path.join(directory, 'review-media'),
      DOODLE_UPLOAD_DIRECTORY: path.join(directory, 'doodles'), MOMENT_UPLOAD_DIRECTORY: path.join(directory, 'moments'),
      WEBRTC_STUN_URLS: ' ', WEBRTC_TURN_URLS: '', WEBRTC_TURN_SECRET: '', WEBRTC_RELAY_ONLY: 'false' }
  });
  let logs = ''; server.stdout.on('data', (data) => { logs += data; }); server.stderr.on('data', (data) => { logs += data; });
  let browser;
  const pages = [];
  const errors = [];
  try {
    await waitFor(async () => (await fetch(`${url}/healthz`)).ok, 'test server');
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    async function participant(mobile = false) {
      const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 900 } });
      await context.grantPermissions(['microphone', 'camera'], { origin: url });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.__captures = []; window.__tracks = []; window.__peers = [];
        const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          window.__captures.push(constraints);
          const stream = await acquire(constraints); window.__tracks.push(...stream.getTracks()); return stream;
        };
        const Original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Original {
          constructor(configuration) { super(configuration); this.trace = []; window.__peers.push(this); this.addEventListener('icecandidate', ({ candidate }) => { this.trace.push({ event: 'local-candidate', candidate: candidate?.toJSON() }); }); }
          async setLocalDescription(...args) { await super.setLocalDescription(...args); this.trace.push({ event: 'local-description', description: this.localDescription?.toJSON() }); }
          async setRemoteDescription(description) { this.trace.push({ event: 'remote-description', description }); return super.setRemoteDescription(description); }
          async addIceCandidate(candidate) { this.trace.push({ event: 'remote-candidate', candidate }); return super.addIceCandidate(candidate); }
        };
      });
      await page.goto(`${url}/soul/soul-harbor`);
      await waitFor(() => page.getByRole('button', { name: '语音通话', exact: true }).isEnabled(), 'room join');
      assert.equal(await page.evaluate(() => window.__captures.length), 0, 'room arrival must not capture devices');
      return page;
    }
    const host = await participant();
    const guest = await participant();
    await host.getByRole('button', { name: '语音通话', exact: true }).click();
    await host.getByRole('button', { name: '挂断通话', exact: true }).waitFor();
    await guest.getByRole('button', { name: '加入', exact: true }).click();
    for (const page of [host, guest]) {
      await waitFor(() => page.evaluate(() => window.__peers.length === 1 && window.__peers[0].connectionState === 'connected'), 'two-way RTC connection');
      assert.equal(await page.evaluate(() => window.__captures.every((constraints) => constraints.video === false)), true);
      await waitFor(() => page.evaluate(async () => {
        const stats = await window.__peers[0].getStats(); return [...stats.values()].some((stat) => stat.type === 'inbound-rtp' && stat.kind === 'audio' && stat.bytesReceived > 0);
      }), 'incoming audio packets');
    }
    console.log('PASS two-party audio with no camera acquisition');
    await host.getByRole('button', { name: '开启摄像头', exact: true }).click();
    await waitFor(() => guest.evaluate(async () => {
      const stats = await window.__peers[0].getStats(); return [...stats.values()].some((stat) => stat.type === 'inbound-rtp' && stat.kind === 'video' && stat.framesDecoded > 0);
    }), 'video frames decoded');
    await guest.screenshot({ path: path.join(output, 'desktop-video.png') });
    await host.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    const miniHeader = host.locator('.is-mini .soul-call-header');
    const headerBounds = await miniHeader.boundingBox();
    await host.mouse.move(headerBounds.x + 30, headerBounds.y + 15); await host.mouse.down();
    await host.mouse.move(headerBounds.x - 90, headerBounds.y + 80); await host.mouse.up();
    assert.ok((await miniHeader.boundingBox()).x < headerBounds.x - 50, 'mini window can be dragged');
    await host.getByRole('textbox', { name: '输入消息', exact: true }).fill('通话中仍然可以聊天');
    await host.getByRole('button', { name: '发送', exact: true }).click();
    await host.screenshot({ path: path.join(output, 'desktop-mini.png') });
    await host.getByRole('button', { name: '展开通话', exact: true }).click();
    assert.equal(await host.evaluate(() => window.__peers.length), 1, 'view changes preserve peer');
    assert.equal(await host.evaluate(() => window.__captures.length), 2, 'view changes do not reacquire devices');
    await host.getByRole('button', { name: '关闭摄像头', exact: true }).click();
    assert.equal(await host.evaluate(() => window.__tracks.filter((track) => track.kind === 'video').every((track) => track.readyState === 'ended')), true);
    assert.equal(await host.evaluate(() => window.__tracks.some((track) => track.kind === 'audio' && track.readyState === 'live')), true);
    console.log('PASS real video frames, full/mini continuity, camera stop preserves voice');
    const mobile = await participant(true);
    await mobile.getByRole('button', { name: '加入', exact: true }).click();
    await mobile.getByText('通话前，先允许设备访问', { exact: true }).waitFor();
    await waitFor(() => mobile.locator('.ant-modal').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return getComputedStyle(element).opacity === '1' && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }), 'mobile permission dialog inside viewport');
    assert.equal(await mobile.evaluate(() => window.__captures.length), 0, 'mobile reminder precedes capture');
    await mobile.screenshot({ path: path.join(output, 'mobile-permission.png'), animations: 'disabled' });
    await mobile.getByRole('button', { name: '暂不通话', exact: true }).click();
    assert.equal(await mobile.evaluate(() => window.__captures.length), 0, 'declining reminder never captures');
    await mobile.getByRole('button', { name: '加入', exact: true }).click();
    await mobile.getByRole('button', { name: '继续并开启麦克风', exact: true }).click();
    await waitFor(() => mobile.evaluate(() => window.__peers.length === 2 && window.__peers.every((peer) => peer.connectionState === 'connected')), 'three-party mesh');
    await mobile.screenshot({ path: path.join(output, 'mobile-group.png') });
    await mobile.getByRole('button', { name: '开启摄像头', exact: true }).click();
    assert.equal(await mobile.evaluate(() => window.__captures.length), 1, 'camera reminder precedes video capture');
    await mobile.getByRole('button', { name: '继续并开启摄像头', exact: true }).click();
    await waitFor(() => mobile.evaluate(() => window.__tracks.some((track) => track.kind === 'video' && track.readyState === 'live')), 'mobile camera enabled');
    await mobile.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    await mobile.screenshot({ path: path.join(output, 'mobile-mini.png') });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout stays inside viewport');
    console.log('PASS mobile reminders before media acquisition and three-party mesh');
    for (const page of [mobile, guest, host]) {
      await page.getByRole('button', { name: '挂断通话', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__tracks.every((track) => track.readyState === 'ended')), true, 'hangup releases all hardware');
      assert.equal(await page.evaluate(() => window.__peers.every((peer) => peer.connectionState === 'closed')), true, 'hangup closes all peers');
    }
    await host.getByRole('button', { name: '视频通话', exact: true }).click();
    await host.getByRole('button', { name: '挂断通话', exact: true }).waitFor();
    await host.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    await host.getByRole('link', { name: '返回星球', exact: true }).click();
    await host.waitForURL(`${url}/soul`);
    assert.equal(await host.evaluate(() => window.__tracks.every((track) => track.readyState === 'ended')), true, 'leaving the room releases devices');
    assert.deepEqual(errors, [], 'no uncaught page errors');
    console.log('PASS hangup and room navigation cleanup; no uncaught page errors');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    const diagnostics = await Promise.all(pages.map((page) => page.evaluate(() => window.__peers?.map((peer) => ({ connection: peer.connectionState, ice: peer.iceConnectionState, signaling: peer.signalingState, trace: peer.trace }))).catch(() => null)));
    fs.writeFileSync(path.join(output, 'diagnostics.json'), JSON.stringify({ errors, diagnostics }, null, 2));
    console.error(JSON.stringify(diagnostics.map((peers) => peers?.map(({ connection, ice, signaling }) => ({ connection, ice, signaling })))));
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(output, `failure-${i}.png`) }).catch(() => undefined);
    console.error(logs); throw error;
  } finally {
    await browser?.close();
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    if (server.exitCode === null) { server.kill(); await stopped; }
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('neon-webrtc-browser-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
