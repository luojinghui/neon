// Canonical 468-vertex MediaPipe face topology (Apache-2.0).
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const source = 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj';
(async () => {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Face mesh: ${response.status}`);
  const text = await response.text();
  const sha256 = createHash('sha256').update(text).digest('hex');
  if (sha256 !== '8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618') throw new Error('Canonical model changed; review its topology before updating the pin');
  const vertices = [], triangles = [];
  for (const line of text.split('\n')) {
    const [kind, ...values] = line.trim().split(/\s+/);
    if (kind === 'v') vertices.push(values.map(Number));
    if (kind === 'f') triangles.push(...values.map(value => Number(value.split('/')[0]) - 1));
  }
  if (vertices.length !== 468 || triangles.some(index => index < 0 || index >= 468)) throw new Error('Invalid face mesh');
  const xs = vertices.map(v => v[0]), ys = vertices.map(v => v[1]);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.max(...ys), bottom = Math.min(...ys);
  const uv = vertices.flatMap(([x, y]) => [Number(((x - left) / (right - left)).toFixed(6)), Number(((top - y) / (top - bottom)).toFixed(6))]);
  const result = { source, license: 'Apache-2.0', sha256, uv, triangles };
  await fs.writeFile(path.join(__dirname, '../src/modules/video-effects/face-mesh.json'), JSON.stringify(result) + '\n');
  console.log(`Prepared ${vertices.length} vertices / ${triangles.length / 3} triangles`);
})().catch(error => { console.error(error); process.exitCode = 1; });
