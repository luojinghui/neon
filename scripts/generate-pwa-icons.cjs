#!/usr/bin/env node

// Run with: node scripts/generate-pwa-icons.cjs
// SVGs are the editable sources. Use Next's existing sharp dependency so this
// build step needs no extra package or platform-specific graphics tooling.
const { createRequire } = require('node:module');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const requireFromNext = createRequire(require.resolve('next/package.json'));
const sharp = requireFromNext('sharp');
const publicDir = path.resolve(__dirname, '../public');
const iconDir = path.join(publicDir, 'icons');

async function render(source, size, opaque = false) {
  let pipeline = sharp(source, { density: 288 }).resize(size, size);
  if (opaque) pipeline = pipeline.flatten({ background: '#fff1df' });
  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

function makeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2); // ICO, not CUR.
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;

  entries.forEach(({ size, png }, index) => {
    const position = 6 + index * 16;
    header[position] = size === 256 ? 0 : size;
    header[position + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(png.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...entries.map(({ png }) => png)]);
}

async function main() {
  const [standard, maskable] = await Promise.all([
    readFile(path.join(iconDir, 'soul.svg')),
    readFile(path.join(iconDir, 'soul-maskable.svg')),
  ]);

  const outputs = [
    ['soul-192.png', standard, 192, false],
    ['soul-512.png', standard, 512, false],
    ['soul-maskable-192.png', maskable, 192, true],
    ['soul-maskable-512.png', maskable, 512, true],
    // iOS supplies its own rounded mask. Feed it opaque square artwork.
    ['apple-touch-icon.png', maskable, 180, true],
    ['favicon-32.png', standard, 32, false],
  ];

  for (const [filename, source, size, opaque] of outputs) {
    await writeFile(path.join(iconDir, filename), await render(source, size, opaque));
    console.log(`Generated public/icons/${filename} (${size} × ${size})`);
  }

  const entries = await Promise.all([16, 32, 48].map(async (size) => ({
    size,
    png: await render(standard, size),
  })));
  await writeFile(path.join(publicDir, 'favicon.ico'), makeIco(entries));
  console.log('Generated public/favicon.ico (16, 32, 48 px PNG entries)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
