// Isolated real-model/GPU smoke and performance probe. Never opens a camera.
// WEBRTC_EFFECTS_TEST_IMAGE=/path/to/portrait.jpg node scripts/video-effects-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const portrait = process.env.WEBRTC_EFFECTS_TEST_IMAGE;
if (!portrait) throw new Error('Set WEBRTC_EFFECTS_TEST_IMAGE to a local test portrait');
const output = path.join(root, '.cache/video-effects-qa'); fs.mkdirSync(output, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<html><body style="margin:32px;background:#0b1024;color:#ddd;font:16px sans-serif"><h1>Video effects · synthetic input</h1><video id="preview" autoplay muted playsinline style="width:640px;height:480px"></video><pre id="status"></pre></body></html>'); return;
  }
  if (url.pathname === '/portrait.jpg') { res.setHeader('content-type', 'image/jpeg'); res.end(fs.readFileSync(portrait)); return; }
  let file = path.resolve(root, url.pathname.startsWith('/src/') || url.pathname.startsWith('/public/') ? '.' + url.pathname : './public' + url.pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (!path.extname(file)) file += '.ts';
  try {
    const data = fs.readFileSync(file);
    if (file.endsWith('.ts')) {
      let { outputText } = ts.transpileModule(data.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      outputText = outputText.replace(/from\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
        if (specifier.startsWith('@/')) return `from '/src/${specifier.slice(2)}'`;
        return match;
      });
      res.setHeader('content-type', 'text/javascript'); res.end(outputText);
    } else if (file.endsWith('.json')) { res.setHeader('content-type', 'text/javascript'); res.end(`export default ${data};`); }
    else { res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); }
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    for (const engine of (process.env.EFFECTS_BROWSERS || 'chromium,webkit').split(',')) {
      const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}), args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } : {}) });
      let page;
      try {
        page = await browser.newPage({ viewport: { width: 900, height: 680 } });
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(request.url()));
        page.on('console', message => { if (message.type() === 'error') console.log(engine, message.text().slice(0, 300)); });
        await page.goto(url);
        if (!await page.evaluate(() => typeof document.createElement('canvas').captureStream === 'function')) {
          // Windows WebKit does not expose captureStream. Still exercise its real
          // worker/WASM models and GPU compositor, without calling this a call test.
          const result = await page.evaluate(async () => {
            const { VideoInference } = await import('/src/modules/video-effects/inference.ts');
            const { CallRenderer } = await import('/src/modules/video-effects/renderer.ts');
            const { DEFAULT_VIDEO_EFFECTS } = await import('/src/modules/video-effects/types.ts');
            const image = new Image(); image.src = '/portrait.jpg'; await image.decode();
            const input = document.createElement('canvas'); input.width = 320; input.height = 240;
            input.getContext('2d').drawImage(image, 0, 0, image.width, image.width * .75, 0, 0, 320, 240);
            const inference = new VideoInference();
            const models = await Promise.all(['face_landmarker.task', 'selfie_segmenter_landscape.tflite'].map(async name => new Uint8Array(await (await fetch(`/mediapipe/0.10.35/${name}`)).arrayBuffer())));
            await inference.configure({ faceModel: models[0], segmentModel: models[1] });
            const renderer = new CallRenderer(640, 480); document.querySelector('#preview').replaceWith(renderer.canvas);
            const samples = [];
            for (let i = 0; i < 8; i++) {
              const result = await inference.infer(input, performance.now(), true, true);
              samples.push(result.inferenceMs);
              if (result.face.length < 468 * 3 || !result.mask) throw new Error('WebKit inference missing face or mask');
              renderer.updateMask(result.mask, performance.now());
              renderer.render(input, { ...DEFAULT_VIDEO_EFFECTS, faceEffect: 'panda', background: 'cosmos' }, result.face, performance.now());
            }
            const backend = inference.backend; inference.close(); renderer.dispose();
            return { engine: 'webkit', mode: 'inference-and-render-only', backend, inferenceMs: samples };
          });
          assert.deepEqual(errors, []); results.push(result); console.log(JSON.stringify(result)); continue;
        }
        await page.evaluate(async () => {
          const { LiveVideoEffects } = await import('/src/modules/video-effects/processor.ts');
          const { DEFAULT_VIDEO_EFFECTS } = await import('/src/modules/video-effects/types.ts');
          window.defaults = DEFAULT_VIDEO_EFFECTS;
          const image = new Image(); image.src = '/portrait.jpg'; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
          const context = canvas.getContext('2d');
          const draw = () => context.drawImage(image, 0, 0, image.width, image.width * .75, 0, 0, 640, 480);
          draw(); window.sourceTimer = setInterval(draw, 1000 / 30);
          window.rawTrack = canvas.captureStream(30).getVideoTracks()[0];
          window.failures = []; window.samples = [];
          window.processor = new LiveVideoEffects(window.rawTrack, status => {
            window.effectStatus = status; if (status.fps !== undefined) window.samples.push({ ...status });
            document.querySelector('#status').textContent = JSON.stringify(status, null, 2);
          }, error => window.failures.push(String(error)));
          window.processor.configure({ ...window.defaults, sticker2d: 'starlight' });
          window.processedTrack = await window.processor.start();
          document.querySelector('#preview').srcObject = new MediaStream([window.processedTrack]);
          await document.querySelector('#preview').play();
        });
        await page.waitForFunction(() => window.effectStatus.faceDetected === true || window.failures.length, { timeout: 120000 });
        assert.deepEqual(await page.evaluate(() => window.failures), [], `${engine}: inference`);
        assert.equal(requests.some(url => /selfie_.*tflite/.test(url)), false, '2D stickers never load segmentation');
        assert.equal(requests.some(url => /portrait-stickers/.test(url)), false, '2D stickers never load old ornaments');
        await page.waitForTimeout(2500);
        const sticker = await page.evaluate(() => ({ ...window.effectStatus }));
        await page.screenshot({ path: path.join(output, `${engine}-sticker.png`) });
        await page.evaluate(() => window.processor.configure({ ...window.defaults, background: 'cosmos' }));
        await page.waitForFunction(() => window.effectStatus.maskAgeMs !== undefined || window.failures.length, { timeout: 120000 });
        assert.deepEqual(await page.evaluate(() => window.failures), []);
        await page.waitForTimeout(2500);
        const background = await page.evaluate(() => ({ ...window.effectStatus }));
        await page.screenshot({ path: path.join(output, `${engine}-background.png`) });
        await page.evaluate(() => window.processor.configure({ ...window.defaults, faceEffect: 'fox', background: 'cosmos' }));
        await page.waitForTimeout(2500);
        const mesh = await page.evaluate(() => ({ ...window.effectStatus }));
        await page.screenshot({ path: path.join(output, `${engine}-mesh.png`) });
        assert.deepEqual(await page.evaluate(() => window.failures), []);
        assert.equal(requests.some(url => /selfie_multiclass/.test(url)), false, 'live calls never use the heavy portrait model');
        assert.equal(await page.evaluate(() => document.querySelector('#preview').currentTime > 5), true, 'processed track keeps producing frames');
        assert.deepEqual(errors, []);
        await page.evaluate(() => { window.processor.dispose(); clearInterval(window.sourceTimer); });
        assert.equal(await page.evaluate(() => window.processedTrack.readyState), 'ended');
        assert.equal(await page.evaluate(() => window.rawTrack.readyState), 'live', 'processor never stops the caller-owned camera');
        await page.evaluate(() => window.rawTrack.stop());
        results.push({ engine, sticker, background, mesh });
        console.log(JSON.stringify(results.at(-1)));
      } catch (error) {
        if (page) {
          console.log('DIAGNOSTICS', await page.evaluate(() => ({ status: window.effectStatus, failures: window.failures, samples: window.samples?.slice(-3), worker: window.processor?.inference?.backend, time: window.processor?.video?.currentTime, inFlight: window.processor?.inFlight, inferenceMs: window.processor?.inferenceMs, face: window.processor?.tracker?.current?.length })));
          await page.screenshot({ path: path.join(output, `${engine}-failure.png`) });
        }
        throw error;
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(results, null, 2));
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
