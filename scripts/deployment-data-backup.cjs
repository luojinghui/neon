#!/usr/bin/env node
'use strict';

// No dependencies: this also runs on the deployment host before the app starts.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { validateStoragePaths } = require('./deployment-storage-env.cjs');

const releasePattern = /^[0-9a-f]{40}-[0-9]+-[0-9]+$/;
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function optionalStat(file) {
  try { return await fs.lstat(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function copyVerified(source, destination, manifest, relative, excludedRoot, ancestors = []) {
  // lstat first: a dangling symlink must fail, rather than look like missing data.
  if (!await optionalStat(source)) {
    if (ancestors.length) throw new Error(`Data disappeared during backup: ${source}`);
    manifest.missing.push(relative);
    return;
  }
  const realSource = await fs.realpath(source);
  if (excludedRoot && inside(excludedRoot, realSource)) {
    manifest.sharedLinks.push({ path: relative, target: realSource });
    return;
  }
  if (ancestors.includes(realSource)) throw new Error(`Symlink cycle in ${source}`);
  const before = await fs.stat(source);
  if (before.isDirectory()) {
    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
    const names = (await fs.readdir(source)).sort();
    for (const name of names) {
      await copyVerified(path.join(source, name), path.join(destination, name), manifest,
        path.join(relative, name), excludedRoot, [...ancestors, realSource]);
    }
    if (JSON.stringify(names) !== JSON.stringify((await fs.readdir(source)).sort())) {
      throw new Error(`Directory changed during backup: ${source}`);
    }
    const handle = await fs.open(destination, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } else if (before.isFile()) {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.copyFile(source, destination, require('node:fs').constants.COPYFILE_EXCL);
    await fs.chmod(destination, 0o600);
    const [sourceHash, destinationHash, after] = await Promise.all([
      sha256(source), sha256(destination), fs.stat(source),
    ]);
    if (sourceHash !== destinationHash || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`Data changed or failed verification: ${source}`);
    }
    const handle = await fs.open(destination, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    manifest.files.push({ path: relative, bytes: after.size, sha256: destinationHash });
  } else {
    throw new Error(`Unsupported data file type: ${source}`);
  }
}

async function createBackup(appRoot, kind, releaseId, resources, excludedRoot) {
  if (!releasePattern.test(releaseId)) throw new Error('Invalid release ID');
  appRoot = await fs.realpath(appRoot);
  const backupRoot = path.join(appRoot, 'backups');
  await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
  if (await fs.realpath(backupRoot) !== backupRoot) {
    throw new Error('The backups directory must not be a symlink');
  }
  const name = `${kind}-${releaseId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const pending = path.join(backupRoot, `.partial-${name}`);
  const complete = path.join(backupRoot, name);
  await fs.mkdir(pending, { mode: 0o700 });
  const manifest = {
    version: 1, kind, releaseId, createdAt: new Date().toISOString(),
    resources, files: [], missing: [], sharedLinks: [],
  };
  // Failed/incomplete copies remain .partial-* for investigation; never mark them complete.
  for (const resource of resources) {
    const realSource = await fs.realpath(resource.source).catch((error) => {
      if (error.code === 'ENOENT') return path.resolve(resource.source);
      throw error;
    });
    if (inside(backupRoot, realSource) || inside(realSource, backupRoot)) {
      throw new Error('Cannot back up the backup directory into itself');
    }
    await copyVerified(resource.source, path.join(pending, resource.path), manifest, resource.path, excludedRoot);
  }
  const manifestHandle = await fs.open(path.join(pending, 'manifest.json'), 'wx', 0o600);
  try {
    await manifestHandle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
    await manifestHandle.sync();
  } finally { await manifestHandle.close(); }
  const pendingHandle = await fs.open(pending, 'r');
  try { await pendingHandle.sync(); } finally { await pendingHandle.close(); }
  await fs.rename(pending, complete);
  const rootHandle = await fs.open(backupRoot, 'r');
  try { await rootHandle.sync(); } finally { await rootHandle.close(); }
  return complete;
}

async function snapshotShared(appRoot, releaseId, env = process.env) {
  validateStoragePaths(env);
  const shared = path.join(appRoot, 'shared');
  const resources = [
    ['SOUL_CHAT_DATA_FILE', 'soul-data/soul-chat.json'],
    ['USER_PROFILE_DATA_FILE', 'user-data/user-profiles.json'],
    ['DOODLE_REVIEW_DATA_FILE', 'doodle-data/doodle-reviews.json'],
    ['DOODLE_SHARE_DATA_FILE', 'doodle-data/doodle-shares.json'],
    ['MOMENT_DATA_FILE', 'moment-data/moments.json'],
    ['DOODLE_REVIEW_UPLOAD_DIRECTORY', 'doodle-review-images'],
    ['DOODLE_UPLOAD_DIRECTORY', 'soul-uploads/doodle'],
    ['MOMENT_UPLOAD_DIRECTORY', 'soul-uploads/moments'],
    [null, 'soul-uploads/soul'], [null, 'soul-uploads/profile'],
    [null, 'upload'], [null, 'static'],
  ].map(([variable, relative]) => ({
    path: relative, source: (variable && env[variable]) || path.join(shared, relative),
  }));
  return createBackup(appRoot, 'shared', releaseId, resources);
}

async function preserveRelease(appRoot, releaseDir) {
  const releaseId = path.basename(releaseDir);
  if (!releasePattern.test(releaseId) || path.resolve(releaseDir) !== path.join(path.resolve(appRoot), 'releases', releaseId)) {
    throw new Error('Refusing a release outside the releases directory');
  }
  if ((await fs.lstat(releaseDir)).isSymbolicLink()) throw new Error('Release must not be a symlink');
  appRoot = await fs.realpath(appRoot);
  releaseDir = await fs.realpath(releaseDir);
  if (releaseDir !== path.join(appRoot, 'releases', releaseId)) throw new Error('Release path must not traverse a symlink');
  const shared = await fs.realpath(path.join(appRoot, 'shared'));
  const resources = ['.data', 'public/uploads', 'upload', 'static'].map((relative) => ({
    path: relative, source: path.join(releaseDir, relative),
  }));
  return createBackup(appRoot, 'release', releaseId, resources, shared);
}

module.exports = { snapshotShared, preserveRelease };

if (require.main === module) {
  const [mode, appRoot, target] = process.argv.slice(2);
  const operation = mode === 'shared' ? snapshotShared : mode === 'release' ? preserveRelease : null;
  if (!operation || !appRoot || !target) {
    console.error('Usage: node scripts/deployment-data-backup.cjs <shared|release> <app-root> <release-id|release-dir>');
    process.exitCode = 1;
  } else {
    operation(appRoot, target).then((result) => console.log(`Verified data backup: ${result}`)).catch((error) => {
      console.error(`Data backup failed; do not remove releases: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
