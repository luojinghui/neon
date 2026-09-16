'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { snapshotShared, preserveRelease } = require('./deployment-data-backup.cjs');
const { captureStorageEnvironment, rollbackEnvironment } = require('./deployment-storage-env.cjs');

const releaseId = `${'a'.repeat(40)}-123-1`;
const projectRoot = path.resolve(__dirname, '..');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neon-backup-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'shared'));
  const release = path.join(root, 'releases', releaseId);
  await fs.mkdir(release, { recursive: true });
  return { root, release };
}

async function write(root, relative, contents) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
  return file;
}

async function manifest(backup) {
  return JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
}

test('shared snapshot preserves paired indices and original images, including configured storage paths', async (t) => {
  const { root } = await fixture(t);
  const reviews = '{"reviews":[{"id":"review-1","status":"approved"}]}';
  const customIndex = await write(root, 'custom/reviews.json', reviews);
  const image = Buffer.from([0, 1, 2, 255, 30]);
  await write(root, 'custom/images/original.png', image);
  await write(root, 'shared/doodle-data/doodle-shares.json', '{"shares":[]}');
  await write(root, 'shared/soul-uploads/doodle/shared.png', image);
  await write(root, 'shared/moment-data/moments.json', '{"moments":[]}');
  await write(root, 'shared/app.env', 'SECRET=must-not-be-copied');
  const backup = await snapshotShared(root, releaseId, {
    DOODLE_REVIEW_DATA_FILE: customIndex,
    DOODLE_REVIEW_UPLOAD_DIRECTORY: path.join(root, 'custom/images'),
  });
  assert.equal(await fs.readFile(path.join(backup, 'doodle-data/doodle-reviews.json'), 'utf8'), reviews);
  assert.deepEqual(await fs.readFile(path.join(backup, 'doodle-review-images/original.png')), image);
  const inventory = await manifest(backup);
  assert.equal((await fs.readFile(path.join(backup, 'manifest.json'))).at(-1), 10);
  assert.equal(inventory.files.length, 5);
  for (const file of inventory.files) {
    const bytes = await fs.readFile(path.join(backup, file.path));
    assert.equal(file.bytes, bytes.length);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.ok(!inventory.files.some((file) => file.path.includes('app.env')));
  // A later live-data mutation must not mutate the backup (no hardlinks).
  await fs.writeFile(customIndex, '{}');
  assert.equal(await fs.readFile(path.join(backup, 'doodle-data/doodle-reviews.json'), 'utf8'), reviews);
});

test('release preservation copies historical data and independent uploads, excluding live shared symlinks', async (t) => {
  const { root, release } = await fixture(t);
  await write(release, '.data/doodle-reviews.json', '{"old":"review"}');
  await write(release, '.data/doodle-review-images/old.png', 'original');
  await write(release, 'public/uploads/doodle/old.png', 'published');
  await write(release, 'upload/private.bin', 'upload');
  await write(root, 'shared/static/live.bin', 'live');
  await fs.symlink(path.join(root, 'shared/static'), path.join(release, 'static'));
  const backup = await preserveRelease(root, release);
  await fs.rm(release, { recursive: true });
  assert.equal(await fs.readFile(path.join(backup, '.data/doodle-review-images/old.png'), 'utf8'), 'original');
  assert.equal(await fs.readFile(path.join(backup, 'public/uploads/doodle/old.png'), 'utf8'), 'published');
  const inventory = await manifest(backup);
  assert.equal(inventory.files.length, 4);
  assert.equal(inventory.sharedLinks[0].path, 'static');
  assert.equal(await fs.readFile(path.join(root, 'shared/static/live.bin'), 'utf8'), 'live');
});

test('release snapshot dereferences independent symlinks and keeps nested shared mounts separate', async (t) => {
  const { root, release } = await fixture(t);
  await write(root, 'legacy-originals/a.png', 'legacy');
  await write(root, 'shared/soul-uploads/moments/m.jpg', 'shared');
  await fs.mkdir(path.join(release, 'public/uploads'), { recursive: true });
  await fs.symlink(path.join(root, 'legacy-originals'), path.join(release, 'public/uploads/doodle'));
  await fs.symlink(path.join(root, 'shared/soul-uploads/moments'), path.join(release, 'public/uploads/moments'));
  const backup = await preserveRelease(root, release);
  assert.equal(await fs.readFile(path.join(backup, 'public/uploads/doodle/a.png'), 'utf8'), 'legacy');
  assert.equal((await manifest(backup)).sharedLinks[0].path, 'public/uploads/moments');
});

test('unreadable data or cyclic links leave no completed backup and prevent cleanup', async (t) => {
  const { root, release } = await fixture(t);
  await write(release, '.data/doodle-reviews.json', 'must survive');
  await fs.symlink(path.join(release, '.data'), path.join(release, '.data/cycle'));
  const workflow = await fs.readFile(path.join(projectRoot, '.github/workflows/nextjs.yml'), 'utf8');
  const cleanup = workflow.match(/            node "\$\{release_dir\}\/scripts\/deployment-data-backup\.cjs" release[^\n]+\n            rm -rf -- "\$\{stale_release\}"/);
  assert.ok(cleanup, 'workflow must guard deletion with backup success');
  const result = spawnSync('bash', ['-c', cleanup[0]], {
    env: { ...process.env, app_root: root, release_dir: projectRoot, stale_release: release }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink cycle/);
  assert.equal(await fs.readFile(path.join(release, '.data/doodle-reviews.json'), 'utf8'), 'must survive');
  assert.ok((await fs.readdir(path.join(root, 'backups'))).every((name) => name.startsWith('.partial-')));
});

test('backup destination symlinks and release traversal fail closed', async (t) => {
  const { root, release } = await fixture(t);
  await fs.symlink(path.join(root, 'shared'), path.join(root, 'backups'));
  await assert.rejects(preserveRelease(root, release), /must not be a symlink/);
  await assert.rejects(preserveRelease(root, path.join(root, releaseId)), /outside/);
  assert.deepEqual(await fs.readdir(path.join(root, 'shared')), []);
});

test('deployment cannot start the new app when a stopped-process snapshot fails', async (t) => {
  const { root, release } = await fixture(t);
  await fs.symlink(path.join(root, 'does-not-exist'), path.join(root, 'shared/doodle-review-images'));
  const workflow = await fs.readFile(path.join(projectRoot, '.github/workflows/nextjs.yml'), 'utf8');
  const functions = workflow.slice(workflow.indexOf('          migrate_doodle_storage()'), workflow.indexOf('          ln -sfn "${release_dir}"'));
  const script = `
    ${functions}
    pm2() {
      case "$1" in
        jlist) printf '[{"name":"neon"}]' ;;
        delete) printf 'stopped\\n' >> "$trace" ;;
        start) printf 'started\\n' >> "$trace" ;;
      esac
    }
    if start_release "$target" "$release_id" "" "$release_id"; then exit 0; else exit 1; fi
  `;
  const trace = path.join(root, 'trace');
  const result = spawnSync('bash', ['-c', script], {
    env: { ...process.env, app_root: root, release_dir: projectRoot, target: release, release_id: releaseId, trace }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Data backup failed/);
  assert.equal(await fs.readFile(trace, 'utf8'), 'stopped\n');
});

test('successful deployment snapshots before legacy migration and then starts the app', async (t) => {
  const { root, release } = await fixture(t);
  await write(release, '.data/doodle-reviews.json', '{"reviews":[{"id":"historical"}]}');
  await fs.mkdir(path.join(root, 'shared/doodle-data'));
  const workflow = await fs.readFile(path.join(projectRoot, '.github/workflows/nextjs.yml'), 'utf8');
  const functions = workflow.slice(workflow.indexOf('          migrate_doodle_storage()'), workflow.indexOf('          ln -sfn "${release_dir}"'));
  const script = `
    ${functions}
    pm2() {
      case "$1" in
        jlist) printf '[{"name":"neon"}]' ;;
        delete) printf 'stopped\\n' >> "$trace" ;;
        start) printf 'started\\n' >> "$trace" ;;
      esac
    }
    if start_release "$target" "$release_id" "$target" "$release_id"; then exit 0; else exit 1; fi
  `;
  const trace = path.join(root, 'trace');
  const result = spawnSync('bash', ['-c', script], {
    env: { ...process.env, app_root: root, release_dir: projectRoot, target: release, release_id: releaseId, trace }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(trace, 'utf8'), 'stopped\nstarted\n');
  const names = await fs.readdir(path.join(root, 'backups'));
  assert.equal(names.length, 1);
  const inventory = await manifest(path.join(root, 'backups', names[0]));
  assert.ok(inventory.missing.includes('doodle-data/doodle-reviews.json'));
  assert.equal(await fs.readFile(path.join(root, 'shared/doodle-data/doodle-reviews.json'), 'utf8'), '{"reviews":[{"id":"historical"}]}');
});

test('relative configured storage paths fail before a snapshot or process stop', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(snapshotShared(root, releaseId, { DOODLE_REVIEW_DATA_FILE: './reviews.json' }), /absolute path/);
  await assert.rejects(fs.stat(path.join(root, 'backups')), { code: 'ENOENT' });
  const workflow = await fs.readFile(path.join(projectRoot, '.github/workflows/nextjs.yml'), 'utf8');
  assert.ok(workflow.indexOf('deployment-storage-env.cjs" validate') < workflow.indexOf('          stop_release()'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'deployment-storage-env.cjs'), 'validate'], {
    env: { ...process.env, DOODLE_REVIEW_DATA_FILE: './reviews.json' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absolute path/);
});

test('rollback captures only previous storage settings and restores absent defaults and custom paths', async (t) => {
  const { root, release } = await fixture(t);
  const snapshot = captureStorageEnvironment([{
    name: 'neon', pm2_env: {
      pm_cwd: release, MONGODB_URI: 'test-secret-not-to-capture',
      env: { USER_PROFILE_DATA_FILE: path.join(root, 'old-profiles.json') },
    },
  }], release);
  assert.equal(JSON.stringify(snapshot).includes('test-secret'), false);
  assert.deepEqual(snapshot.values, { USER_PROFILE_DATA_FILE: path.join(root, 'old-profiles.json') });
  const restored = rollbackEnvironment(snapshot, release, releaseId, {
    DOODLE_REVIEW_DATA_FILE: path.join(root, 'shared/doodle-data/doodle-reviews.json'),
    USER_PROFILE_DATA_FILE: path.join(root, 'shared/user-data/user-profiles.json'),
    MONGODB_URI: 'unchanged-test-value',
  });
  assert.equal(Object.hasOwn(restored, 'DOODLE_REVIEW_DATA_FILE'), false);
  assert.equal(restored.USER_PROFILE_DATA_FILE, path.join(root, 'old-profiles.json'));
  assert.equal(restored.MONGODB_URI, 'unchanged-test-value');
  assert.throws(() => captureStorageEnvironment([], release), /Cannot capture/);
});

test('workflow rollback starts the previous release without the failed deployment storage overrides', async (t) => {
  const { root, release } = await fixture(t);
  const trace = path.join(root, 'rollback-trace.json');
  const fakePm2 = await write(root, 'bin/pm2', `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.trace, JSON.stringify({args: process.argv.slice(2), reviewFile: process.env.DOODLE_REVIEW_DATA_FILE || null, profileFile: process.env.USER_PROFILE_DATA_FILE, releaseId: process.env.NEON_RELEASE_ID}));\n`);
  await fs.chmod(fakePm2, 0o700);
  const workflow = await fs.readFile(path.join(projectRoot, '.github/workflows/nextjs.yml'), 'utf8');
  const start = workflow.indexOf('              stop_release\n');
  assert.notEqual(start, -1);
  const rollback = workflow.slice(start, workflow.indexOf('              pm2 save', start));
  const snapshot = captureStorageEnvironment([{
    name: 'neon', pm2_env: { pm_cwd: release, USER_PROFILE_DATA_FILE: path.join(root, 'original-profiles.json') },
  }], release);
  const result = spawnSync('bash', ['-c', `set -euo pipefail\nstop_release() { return 0; }\n${rollback}`], {
    env: {
      ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
      DOODLE_REVIEW_DATA_FILE: path.join(root, 'shared/empty-or-partial.json'),
      USER_PROFILE_DATA_FILE: path.join(root, 'shared/new-profiles.json'),
      release_dir: projectRoot, previous_target: release, previous_release_id: releaseId,
      rollback_storage: JSON.stringify(snapshot), trace,
    }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(await fs.readFile(trace, 'utf8'));
  assert.deepEqual(actual.args, ['start', path.join(release, 'ecosystem.config.cjs'), '--update-env']);
  assert.equal(actual.reviewFile, null);
  assert.equal(actual.profileFile, path.join(root, 'original-profiles.json'));
  assert.equal(actual.releaseId, releaseId);
});
