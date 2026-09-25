const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { createHash } = require('node:crypto');
const VERSION = '0.10.35';
const root = path.join(__dirname, '..', 'public', 'mediapipe', VERSION);
const packageRoot = path.dirname(require.resolve('@mediapipe/tasks-vision'));
const models = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'selfie_multiclass.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
  'selfie_segmenter_landscape.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite'
};
function download(url) {
  return new Promise((resolve, reject) => https.get(url, response => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error(`${url}: ${response.statusCode}`)); return; }
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  }).on('error', reject));
}
(async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.version !== VERSION) throw new Error('Update the asset version together with the SDK');
  await fs.mkdir(path.join(root, 'wasm'), { recursive: true });
  const manifest = { version: VERSION, license: 'Apache-2.0', files: {} };
  const bundle = await fs.readFile(path.join(packageRoot, 'vision_bundle.mjs'));
  await fs.writeFile(path.join(root, 'vision_bundle.mjs'), bundle);
  manifest.files['vision_bundle.mjs'] = { bytes: bundle.length, sha256: createHash('sha256').update(bundle).digest('hex') };
  for (const file of await fs.readdir(path.join(packageRoot, 'wasm'))) {
    const data = await fs.readFile(path.join(packageRoot, 'wasm', file));
    await fs.writeFile(path.join(root, 'wasm', file), data);
    manifest.files[`wasm/${file}`] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }
  for (const [file, url] of Object.entries(models)) {
    const data = await download(url);
    if (data.length < 100_000) throw new Error(`Invalid model: ${file}`);
    await fs.writeFile(path.join(root, file), data);
    manifest.files[file] = { source: url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'LICENSE'), await download('https://www.apache.org/licenses/LICENSE-2.0.txt'));
  console.log(`Prepared MediaPipe ${VERSION}: ${Object.keys(manifest.files).length} verified assets`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
