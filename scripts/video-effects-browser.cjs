// Independent GPU/track beauty regression. Uses synthetic pixels, never a camera.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.cache/video-effects-qa'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<html><body style="margin:28px;background:#faf8f5;color:#342b28;font:16px system-ui"><h1>美颜 · 合成画面验收</h1><p>不采集摄像头，不加载人脸或背景模型</p><div id="samples" style="display:flex;gap:20px;flex-wrap:wrap"></div><video id="preview" autoplay muted playsinline style="display:block;width:640px;max-width:100%;margin-top:24px;border-radius:16px"></video><pre id="status"></pre></body></html>'); return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(path.join(root, 'src/modules/video-effects') + path.sep)) { res.writeHead(404).end(); return; }
  if (!path.extname(file)) file += '.ts';
  try {
    const source = fs.readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    res.setHeader('content-type', 'text/javascript'); res.end(outputText);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`, results = [];
  try {
    for (const engine of (process.env.EFFECTS_BROWSERS || 'chromium').split(',')) {
      const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } : {}) });
      let page;
      try {
        page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
        await page.goto(url);
        const pixels = await page.evaluate(async () => {
          const { CallRenderer } = await import('/src/modules/video-effects/renderer.ts');
          const source = document.createElement('canvas'); source.width = 640; source.height = 480;
          const context = source.getContext('2d'); context.fillStyle = '#4b6d88'; context.fillRect(0, 0, 640, 480);
          const patch = context.createImageData(260, 220);
          for (let y = 0; y < 220; y++) for (let x = 0; x < 260; x++) {
            const index = (y * 260 + x) * 4, noise = (x + y) % 2 ? 10 : -10;
            patch.data.set([180 + noise, 126 + noise, 96 + noise, 255], index);
          }
          context.putImageData(patch, 24, 32); context.fillStyle = '#141414'; context.fillRect(146, 60, 8, 160);
          context.fillStyle = '#707070'; context.fillRect(340, 32, 120, 220);
          const renderer = new CallRenderer(640, 480);
          const read = () => { const copy = document.createElement('canvas'); copy.width = 640; copy.height = 480; copy.getContext('2d').drawImage(renderer.canvas, 0, 0); return copy; };
          const luminance = (data, x, y) => { const i = (y * 640 + x) * 4; return data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; };
          const region = (data, x, y, width, height) => {
            const values = [];
            for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) values.push(luminance(data, col, row));
            const mean = values.reduce((a, b) => a + b) / values.length;
            return { mean, variance: values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length };
          };
          renderer.render(source, { whitening: 0, smoothing: 0 });
          const original = context.getImageData(0, 0, 640, 480).data, raw = read().getContext('2d').getImageData(0, 0, 640, 480).data;
          let zeroMaxDifference = 0;
          for (let index = 0; index < raw.length; index++) zeroMaxDifference = Math.max(zeroMaxDifference, Math.abs(raw[index] - original[index]));
          renderer.render(source, { whitening: 0, smoothing: 100 });
          const softened = read().getContext('2d').getImageData(0, 0, 640, 480).data;
          renderer.render(source, { whitening: 100, smoothing: 0 });
          const white = read().getContext('2d').getImageData(0, 0, 640, 480).data;
          const stats = {
            zeroMaxDifference,
            originalSkin: region(raw, 40, 60, 80, 120), softenedSkin: region(softened, 40, 60, 80, 120), whitenedSkin: region(white, 40, 60, 80, 120),
            originalNeutral: region(raw, 360, 60, 80, 120), whitenedNeutral: region(white, 360, 60, 80, 120),
            originalEdge: luminance(raw, 145, 100) - luminance(raw, 146, 100), softenedEdge: luminance(softened, 145, 100) - luminance(softened, 146, 100)
          };
          for (const [name, settings] of [['原貌', { whitening: 0, smoothing: 0 }], ['柔肤 + 美白', { whitening: 45, smoothing: 50 }]]) {
            renderer.render(source, settings); const figure = document.createElement('figure'); figure.style.margin = '0'; const canvas = read(); canvas.style.cssText = 'width:440px;max-width:100%;border-radius:14px'; const caption = document.createElement('figcaption'); caption.textContent = name; figure.append(canvas, caption); document.querySelector('#samples').append(figure);
          }
          renderer.dispose(); return stats;
        });
        assert.ok(pixels.zeroMaxDifference <= 1, 'disabled beauty preserves source pixels');
        assert.ok(pixels.softenedSkin.variance < pixels.originalSkin.variance * .85, 'edge-aware filter removes fine skin noise');
        assert.ok(pixels.whitenedSkin.mean > pixels.originalSkin.mean + 3, 'whitening visibly lifts skin midtones');
        assert.ok(Math.abs(pixels.whitenedNeutral.mean - pixels.originalNeutral.mean) <= 1, 'neutral background is not globally whitened');
        assert.ok(pixels.softenedEdge >= pixels.originalEdge * .9, 'dark facial detail edges stay sharp');
        const capture = await page.evaluate(() => typeof document.createElement('canvas').captureStream === 'function');
        let stream = { supported: false };
        if (capture) {
          await page.evaluate(async () => {
            const { LiveVideoEffects } = await import('/src/modules/video-effects/processor.ts');
            const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
            let frame = 0; const paint = () => { const context = canvas.getContext('2d'); context.fillStyle = '#b47e60'; context.fillRect(0, 0, 1280, 720); context.fillStyle = '#1d2530'; context.fillRect((frame++ * 12) % 1000, 180, 160, 180); };
            paint(); window.sourceTimer = setInterval(paint, 1000 / 30);
            window.rawTrack = canvas.captureStream(30).getVideoTracks()[0];
            window.failures = []; window.samples = [];
            window.processor = new LiveVideoEffects(window.rawTrack, value => { window.effectStatus = value; window.samples.push(value); document.querySelector('#status').textContent = JSON.stringify(value, null, 2); }, error => window.failures.push(String(error)));
            window.processor.configure({ whitening: 45, smoothing: 50 }); window.processedTrack = await window.processor.start();
            const video = document.querySelector('#preview'); video.srcObject = new MediaStream([window.processedTrack]); await video.play();
          });
          await page.waitForFunction(() => document.querySelector('#preview').currentTime > .5 && window.samples.some(value => value.fps > 0), { timeout: 15000 });
          assert.deepEqual(await page.evaluate(() => window.failures), []);
          stream = await page.evaluate(() => ({ supported: true, settings: window.processedTrack.getSettings(), status: window.effectStatus, currentTime: document.querySelector('#preview').currentTime }));
          assert.equal(stream.settings.width, 640); assert.equal(stream.settings.height, 360);
          await page.screenshot({ path: path.join(output, `${engine}-beauty.png`) });
          await page.evaluate(() => { window.processor.dispose(); clearInterval(window.sourceTimer); });
          assert.equal(await page.evaluate(() => window.processedTrack.readyState), 'ended');
          assert.equal(await page.evaluate(() => window.rawTrack.readyState), 'live', 'processor never stops caller camera');
          await page.evaluate(() => window.rawTrack.stop());
        }
        assert.equal(requests.some(value => /mediapipe|call-effects|\.wasm|\.tflite|landmarker/.test(value)), false, 'beauty has no model or removed asset requests');
        assert.deepEqual(errors, []);
        const result = { engine, pixels, stream }; results.push(result); console.log(JSON.stringify(result));
      } catch (error) {
        if (page) await page.screenshot({ path: path.join(output, `${engine}-failure.png`) });
        throw error;
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(results, null, 2));
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
