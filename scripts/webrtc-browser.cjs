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
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ['--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    async function participant(mobile = false) {
      const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 900 } });
      await context.grantPermissions(['microphone', 'camera'], { origin: url });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', (error) => errors.push(error.message));
      const portrait = process.env.WEBRTC_EFFECTS_TEST_IMAGE ? `data:image/jpeg;base64,${fs.readFileSync(process.env.WEBRTC_EFFECTS_TEST_IMAGE).toString('base64')}` : null;
      await page.addInitScript(({ portrait }) => {
        window.__captures = []; window.__tracks = []; window.__peers = []; window.__canvasTracks = []; window.__microphones = [];
        const capture = HTMLCanvasElement.prototype.captureStream;
        HTMLCanvasElement.prototype.captureStream = function (...args) { const stream = capture.apply(this, args); window.__canvasTracks.push(...stream.getTracks()); return stream; };
        const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          window.__captures.push(constraints);
          const stream = await acquire(constraints);
          if (constraints.audio) {
            stream.getAudioTracks().forEach(track => { track.stop(); stream.removeTrack(track); });
            const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
            gain.gain.value = 0; oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume();
            const track = destination.stream.getAudioTracks()[0];
            const stop = track.stop.bind(track); track.stop = () => { stop(); oscillator.stop(); void context.close(); };
            window.__microphones.push({ context, gain }); stream.addTrack(track);
          }
          if (constraints.video && portrait) {
            stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track); });
            const photo = new Image(); photo.src = portrait; await photo.decode();
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
            const draw = () => canvas.getContext('2d').drawImage(photo, 0, 0, photo.width, photo.width * .75, 0, 0, 640, 480);
            draw(); const track = canvas.captureStream(24).getVideoTracks()[0]; const timer = setInterval(draw, 1000 / 24);
            const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
            stream.addTrack(track);
          }
          window.__tracks.push(...stream.getTracks()); return stream;
        };
        const Original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Original {
          constructor(configuration) { super(configuration); this.trace = []; window.__peers.push(this); this.addEventListener('icecandidate', ({ candidate }) => { this.trace.push({ event: 'local-candidate', candidate: candidate?.toJSON() }); }); }
          async setLocalDescription(...args) { await super.setLocalDescription(...args); this.trace.push({ event: 'local-description', description: this.localDescription?.toJSON() }); }
          async setRemoteDescription(description) { this.trace.push({ event: 'remote-description', description }); return super.setRemoteDescription(description); }
          async addIceCandidate(candidate) { this.trace.push({ event: 'remote-candidate', candidate }); return super.addIceCandidate(candidate); }
        };
      }, { portrait });
      await page.goto(`${url}/soul/soul-harbor`);
      await waitFor(() => page.getByRole('button', { name: '语音通话', exact: true }).isEnabled(), 'room join');
      assert.equal(await page.evaluate(() => window.__captures.length), 0, 'room arrival must not capture devices');
      return page;
    }
    if (process.env.WEBRTC_CLIPBOARD_ONLY) {
      await require('./clipboard-browser.cjs')(await participant(), url, output);
      assert.deepEqual(errors, []); return;
    }
    if (process.env.WEBRTC_EXPERIENCE_ONLY) {
      await require('./experience-fixes-browser.cjs')(await participant(), await participant(), url, output, waitFor);
      assert.deepEqual(errors, []); return;
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
    await host.getByRole('button', { name: '参会者列表', exact: true }).click();
    assert.equal(await host.locator('.soul-call-participants li').count(), 2);
    assert.equal(await host.locator('.soul-call-participants').getByText('已连接', { exact: true }).count(), 2);
    await host.screenshot({ path: path.join(output, 'participants-light.png') });
    await host.getByRole('button', { name: '关闭参会者列表', exact: true }).click();
    await host.evaluate(() => { window.__microphones[0].gain.gain.value = .16; });
    await waitFor(() => host.locator('.soul-call-microphone-level').getAttribute('height').then(value => Number(value) > 3), 'live microphone level rises with audio');
    await host.evaluate(() => { window.__microphones[0].gain.gain.value = 0; });
    await waitFor(() => host.locator('.soul-call-microphone-level').getAttribute('height').then(value => Number(value) < .1), 'microphone level falls in silence');
    assert.equal(await host.locator('.soul-call-controls').innerText(), '', 'call controls contain no visible text');
    await host.evaluate(() => document.documentElement.classList.add('dark'));
    await host.screenshot({ path: path.join(output, 'call-dark.png'), animations: 'disabled' });
    await host.evaluate(() => document.documentElement.classList.remove('dark'));
    await host.getByRole('button', { name: '开启摄像头', exact: true }).click();
    await waitFor(() => guest.evaluate(async () => {
      const stats = await window.__peers[0].getStats(); return [...stats.values()].some((stat) => stat.type === 'inbound-rtp' && stat.kind === 'video' && stat.framesDecoded > 0);
    }), 'video frames decoded');
    await guest.screenshot({ path: path.join(output, 'desktop-video.png') });
    assert.match(await host.locator('.is-local video').evaluate(element => getComputedStyle(element).transform), /^matrix\(-1,/, 'local video stays mirrored');
    assert.equal(await host.locator('.soul-call-select-tile').innerText(), '', 'thumbnail has no enlargement badge');
    await host.getByRole('button', { name: '将我的画面放大', exact: true }).click();
    assert.equal(await host.locator('.is-local.is-primary').count(), 1);
    await host.locator('.is-thumbnail .soul-call-select-tile').click();
    assert.equal(await host.locator('.is-local.is-thumbnail').count(), 1);
    assert.equal(await host.evaluate(() => window.__peers.length), 1, 'swapping tiles preserves the peer connection');
    assert.equal(await host.evaluate(() => window.__captures.length), 2, 'swapping tiles never reacquires devices');
    if (process.env.WEBRTC_EFFECTS_TEST_IMAGE) {
      await host.getByRole('button', { name: '画面设置', exact: true }).click();
      await host.getByRole('button', { name: '自然', exact: true }).click();
      await host.getByRole('progressbar', { name: '画面资源加载进度' }).waitFor();
      await host.getByRole('progressbar', { name: '画面资源加载进度' }).waitFor({ state: 'hidden', timeout: 120000 });
      assert.equal(await host.locator('.soul-call-effect-status .is-error').count(), 0, 'real models and GPU initialize');
      await waitFor(() => host.evaluate(() => window.__peers[0].getSenders().some(sender => sender.track?.kind === 'video' && !window.__tracks.includes(sender.track))), 'processed track sent to peers');
      await host.getByRole('tab', { name: '2D 贴纸', exact: true }).click(); await host.getByRole('button', { name: '贴纸：星星脸', exact: true }).click();
      await host.getByRole('tab', { name: '面部化身', exact: true }).click(); await host.getByRole('button', { name: '面部化身：星猫', exact: true }).click();
      await host.getByRole('tab', { name: '背景', exact: true }).click(); await host.getByRole('button', { name: '背景：日光窗', exact: true }).click();
      await waitFor(() => host.getByRole('progressbar').count().then(count => count === 0), 'background model initialization', 120000);
      assert.equal(await host.locator('.soul-call-effect-status .is-error').count(), 0);
      await waitFor(() => host.locator('.soul-call-effect-status').innerText().then(text => !text.includes('面对镜头')), 'real face detection');
      await new Promise(resolve => setTimeout(resolve, 800));
      await host.screenshot({ path: path.join(output, 'effects-settings.png') });
      await guest.screenshot({ path: path.join(output, 'effects-received.png') });
      await host.getByRole('tab', { name: '面部化身', exact: true }).click(); await host.getByRole('button', { name: '面部化身：赤狐', exact: true }).click();
      await new Promise(resolve => setTimeout(resolve, 400));
      await guest.screenshot({ path: path.join(output, 'effects-cartoon.png') });
      await host.getByRole('tab', { name: '美颜', exact: true }).click(); await host.getByRole('button', { name: '原貌', exact: true }).click();
      await host.getByRole('tab', { name: '背景', exact: true }).click(); await host.getByRole('button', { name: '背景：原背景', exact: true }).click();
      await host.getByRole('tab', { name: '2D 贴纸', exact: true }).click(); await host.getByRole('button', { name: '贴纸：无', exact: true }).click();
      await waitFor(() => host.getByRole('progressbar').count().then(count => count === 0), 'latest effects ready', 120000);
      await new Promise(resolve => setTimeout(resolve, 600));
      const faceDifference = await host.evaluate(() => {
        const original = window.__tracks.find(track => track.kind === 'video' && track.readyState === 'live').canvas;
        const output = document.querySelector('.is-local video');
        const snapshot = document.createElement('canvas'); snapshot.width = 640; snapshot.height = 480;
        const context = snapshot.getContext('2d'); context.drawImage(output, 0, 0, 640, 480);
        const a = original.getContext('2d').getImageData(290, 130, 60, 70).data;
        const b = context.getImageData(290, 130, 60, 70).data;
        let difference = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) difference += Math.abs(a[i] - b[i]);
        return difference / (60 * 70 * 3);
      });
      assert.ok(faceDifference > 15, `mesh avatar covers the face: ${faceDifference}`);
      await host.getByRole('tab', { name: '面部化身', exact: true }).click(); await host.getByRole('button', { name: '面部化身：原面容', exact: true }).click();
      await host.getByRole('button', { name: '关闭画面设置', exact: true }).click();
      console.log('PASS real MediaPipe models, face tracking, WebGL effects and processed outgoing track');
    }
    await host.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    const miniHeader = host.locator('.is-mini .soul-call-header');
    const headerBounds = await miniHeader.boundingBox();
    await host.mouse.move(headerBounds.x + 30, headerBounds.y + 15); await host.mouse.down();
    await host.mouse.move(headerBounds.x - 90, headerBounds.y + 80); await host.mouse.up();
    assert.ok((await miniHeader.boundingBox()).x < headerBounds.x - 50, 'mini window can be dragged');
    for (const button of await host.locator('.soul-call-controls > button').all()) assert.ok((await button.locator('svg').boundingBox()).width > 0, 'mini controls keep all icons visible');
    await host.getByRole('textbox', { name: '输入消息', exact: true }).fill('通话中仍然可以聊天');
    await host.getByRole('button', { name: '发送', exact: true }).click();
    await host.screenshot({ path: path.join(output, 'desktop-mini.png') });
    await host.getByRole('button', { name: '展开通话', exact: true }).click();
    assert.equal(await host.evaluate(() => window.__peers.length), 1, 'view changes preserve peer');
    assert.equal(await host.evaluate(() => window.__captures.length), 2, 'view changes do not reacquire devices');
    await host.getByRole('button', { name: '关闭摄像头', exact: true }).click();
    assert.equal(await host.evaluate(() => window.__tracks.filter((track) => track.kind === 'video').every((track) => track.readyState === 'ended')), true);
    assert.equal(await host.evaluate(() => window.__canvasTracks.every(track => track.readyState === 'ended')), true, 'camera off stops processed output immediately');
    assert.equal(await host.evaluate(() => window.__tracks.some((track) => track.kind === 'audio' && track.readyState === 'live')), true);
    console.log('PASS real video frames, full/mini continuity, camera stop preserves voice');
    const mobile = await participant(true);
    await mobile.getByRole('button', { name: '加入', exact: true }).click();
    await mobile.getByText('允许通话权限', { exact: true }).waitFor();
    await waitFor(() => mobile.locator('.ant-modal').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return getComputedStyle(element).opacity === '1' && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }), 'mobile permission dialog inside viewport');
    assert.equal(await mobile.evaluate(() => window.__captures.length), 0, 'mobile reminder precedes capture');
    await mobile.screenshot({ path: path.join(output, 'mobile-permission.png'), animations: 'disabled' });
    await mobile.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await mobile.evaluate(() => window.__captures.length), 0, 'declining reminder never captures');
    await mobile.getByRole('button', { name: '加入', exact: true }).click();
    await mobile.getByRole('button', { name: '开始语音', exact: true }).click();
    await waitFor(() => mobile.evaluate(() => window.__peers.length === 2 && window.__peers.every((peer) => peer.connectionState === 'connected')), 'three-party mesh');
    await mobile.screenshot({ path: path.join(output, 'mobile-group.png') });
    const beforeSettings = await mobile.evaluate(() => window.__captures.length);
    await mobile.getByRole('button', { name: '画面设置', exact: true }).click();
    await mobile.getByRole('tab', { name: '背景', exact: true }).click();
    await mobile.getByRole('button', { name: '背景：小山丘', exact: true }).click();
    assert.equal(await mobile.evaluate(() => window.__captures.length), beforeSettings, 'choosing effects with camera off never acquires it');
    assert.equal(await mobile.getByRole('progressbar').count(), 0, 'no model initialization with camera off');
    await mobile.screenshot({ path: path.join(output, 'mobile-settings.png') });
    const settingsBounds = await mobile.locator('.soul-call-effects').boundingBox();
    const controlsBounds = await mobile.locator('.soul-call-controls').boundingBox();
    const selfBounds = await mobile.locator('.is-local').boundingBox();
    assert.ok(settingsBounds.y + settingsBounds.height <= controlsBounds.y + 1, 'mobile settings leave call controls reachable');
    assert.ok(selfBounds.y + selfBounds.height <= settingsBounds.y, 'mobile personal preview stays above settings');
    await mobile.getByRole('button', { name: /恢复原貌/ }).click();
    await mobile.getByRole('button', { name: '关闭画面设置', exact: true }).click();
    await mobile.getByRole('button', { name: '开启摄像头', exact: true }).click();
    await waitFor(() => mobile.evaluate(() => window.__tracks.some((track) => track.kind === 'video' && track.readyState === 'live')), 'mobile camera enabled');
    assert.equal(await mobile.getByText('允许通话权限', { exact: true }).count(), 0, 'no extra camera reminder inside a call');
    assert.equal(await mobile.locator('.soul-call-controls').getByRole('button', { name: '切换前后摄像头' }).count(), 0);
    await mobile.locator('.is-local').getByRole('button', { name: '切换前后摄像头' }).waitFor();
    await mobile.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    await mobile.screenshot({ path: path.join(output, 'mobile-mini.png') });
    assert.ok((await mobile.locator('.soul-call-panel.is-mini').boundingBox()).width <= 250, 'mobile floating window is compact');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout stays inside viewport');
    console.log('PASS mobile reminders before media acquisition and three-party mesh');
    for (const page of [mobile, guest, host]) {
      await page.getByRole('button', { name: '挂断通话', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__tracks.every((track) => track.readyState === 'ended')), true, 'hangup releases all hardware');
      assert.equal(await page.evaluate(() => window.__peers.every((peer) => peer.connectionState === 'closed')), true, 'hangup closes all peers');
      assert.equal(await page.evaluate(() => window.__canvasTracks.every(track => track.readyState === 'ended')), true, 'hangup stops every processed track');
    }
    await require('./experience-fixes-browser.cjs')(host, guest, url, output, waitFor);
    await host.getByRole('button', { name: '视频通话', exact: true }).click();
    await host.getByRole('button', { name: '挂断通话', exact: true }).waitFor();
    await host.getByRole('button', { name: '缩小到聊天室', exact: true }).click();
    await host.getByRole('link', { name: '返回星球', exact: true }).click();
    await host.waitForURL(`${url}/soul`);
    assert.equal(await host.evaluate(() => window.__tracks.every((track) => track.readyState === 'ended')), true, 'leaving the room releases devices');
    await require('./clipboard-browser.cjs')(host, url, output);
    if (process.env.WEBRTC_EFFECTS_TEST_IMAGE) {
      await host.goto(`${url}/doodle`);
      await host.locator('input[type=file]').setInputFiles(process.env.WEBRTC_EFFECTS_TEST_IMAGE);
      await host.locator('.portrait-controls').waitFor({ timeout: 120000 });
      assert.match(await host.locator('.portrait-hint').innerText(), /已找到 1 张脸/);
      await host.getByRole('button', { name: '兔兔冒泡', exact: true }).click();
      for (const [name, id] of [['小狐探头', 'fox'], ['熊猫抱抱', 'panda'], ['独角兽之梦', 'unicorn']]) {
        const previous = await host.locator('.doodle-result-image').getAttribute('src');
        await host.getByRole('button', { name, exact: true }).click();
        await host.waitForFunction(before => {
          const result = document.querySelector('.doodle-result-image');
          return result?.src !== before && result?.complete && result?.naturalWidth === 1080 && document.querySelector('.doodle-live-preview')?.style.opacity !== '1';
        }, previous);
        const data = await host.evaluate(async () => {
          const blob = await (await fetch(document.querySelector('.doodle-result-image').src)).blob();
          return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
        });
        fs.writeFileSync(path.join(output, `portrait-${id}.jpg`), Buffer.from(data, 'base64'));
      }
      await host.screenshot({ path: path.join(output, 'portrait-settings.png') });
      console.log('PASS static portrait editor remains unchanged by the independent call renderer');
    }
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
