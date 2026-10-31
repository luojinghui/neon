const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sharedResources } = require('./deployment-data-backup.cjs');
const { validateStoragePaths, captureStorageEnvironment, rollbackEnvironment } = require('./deployment-storage-env.cjs');

test('push backup follows the profile data directory or the explicit push file', () => {
  const root = path.resolve(__dirname, '..');
  const pushSource = env => sharedResources(root, env).find(item => item.path === 'user-data/web-push.json').source;
  assert.equal(pushSource({}), path.join(root, 'shared/user-data/web-push.json'));
  assert.equal(pushSource({ USER_PROFILE_DATA_FILE: path.join(root, 'custom/profiles.json') }), path.join(root, 'custom/web-push.json'));
  assert.equal(pushSource({ WEB_PUSH_DATA_FILE: path.join(root, 'custom/push.json') }), path.join(root, 'custom/push.json'));
  assert.throws(() => validateStoragePaths({ WEB_PUSH_DATA_FILE: 'relative.json' }), /absolute/);
});

test('rollback restores previous push storage location and clears a new override if it was absent', () => {
  const root = path.resolve(__dirname, '..');
  const pushFile = path.join(root, 'custom/push.json');
  const snapshot = captureStorageEnvironment([{ name: 'neon', pm2_env: { pm_cwd: root, WEB_PUSH_DATA_FILE: pushFile } }], root);
  assert.equal(rollbackEnvironment(snapshot, root, 'old', {}).WEB_PUSH_DATA_FILE, pushFile);
  const missing = captureStorageEnvironment([{ name: 'neon', pm2_env: { pm_cwd: root } }], root);
  assert.equal(rollbackEnvironment(missing, root, 'old', { WEB_PUSH_DATA_FILE: pushFile }).WEB_PUSH_DATA_FILE, undefined);
});
