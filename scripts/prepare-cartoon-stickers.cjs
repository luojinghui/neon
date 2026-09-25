// Original, unmodified Fluent Emoji 3D PNGs, pinned to an upstream revision.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const revision = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const assets = { cat: ['Cat face', 'cat_face'], fox: ['Fox', 'fox'], panda: ['Panda', 'panda'], rabbit: ['Rabbit face', 'rabbit_face'], bear: ['Bear', 'bear'], unicorn: ['Unicorn', 'unicorn'], alien: ['Alien', 'alien'], crown: ['Crown', 'crown'], planet: ['Ringed planet', 'ringed_planet'], sparkles: ['Sparkles', 'sparkles'], hearts: ['Two hearts', 'two_hearts'] };
async function download(file) {
  const url = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${revision}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url); if (!response.ok) throw Error(`${response.status}: ${file}`);
  return { url, bytes: Buffer.from(await response.arrayBuffer()) };
}
(async () => {
  const directory = path.resolve(__dirname, '../public/portrait-stickers');
  await fs.mkdir(directory, { recursive: true });
  const files = await Promise.all(Object.entries(assets).map(async ([name, [folder, file]]) => {
    const { url, bytes } = await download(`assets/${folder}/3D/${file}_3d.png`);
    if (bytes.subarray(1, 4).toString() !== 'PNG') throw Error(`Invalid image: ${name}`);
    await fs.writeFile(path.join(directory, `${name}.png`), bytes);
    return { file: `${name}.png`, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  await fs.writeFile(path.join(directory, 'LICENSE'), (await download('LICENSE')).bytes);
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ source: 'https://github.com/microsoft/fluentui-emoji', revision, license: 'MIT', files }, null, 2) + '\n');
  console.log(`Prepared ${files.length} cartoon assets (${files.reduce((n, f) => n + f.bytes, 0)} bytes)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
