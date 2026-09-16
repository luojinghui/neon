'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const storageKeys = [
  'SOUL_CHAT_DATA_FILE', 'USER_PROFILE_DATA_FILE',
  'DOODLE_REVIEW_DATA_FILE', 'DOODLE_SHARE_DATA_FILE',
  'DOODLE_REVIEW_UPLOAD_DIRECTORY', 'DOODLE_UPLOAD_DIRECTORY',
  'MOMENT_DATA_FILE', 'MOMENT_UPLOAD_DIRECTORY',
];

function validateStoragePaths(env = process.env) {
  for (const key of storageKeys) {
    if (env[key] && !path.isAbsolute(env[key])) throw new Error(`${key} must be an absolute path`);
  }
}

function captureStorageEnvironment(processes, target) {
  const apps = processes.filter((process) => process.name === 'neon');
  if (!target) return { target: '', values: {} };
  if (apps.length !== 1 || !apps[0].pm2_env || !apps[0].pm2_env.pm_cwd) {
    throw new Error('Cannot capture the previous release storage environment');
  }
  const running = apps[0].pm2_env;
  if (fs.realpathSync(running.pm_cwd) !== fs.realpathSync(target)) {
    throw new Error('The running app does not match the previous release');
  }
  const values = {};
  for (const key of storageKeys) {
    const value = Object.hasOwn(running, key) ? running[key] : running.env?.[key];
    if (value !== undefined) {
      if (typeof value !== 'string') throw new Error(`Invalid previous ${key}`);
      values[key] = value;
    }
  }
  return { target, values };
}

function rollbackEnvironment(snapshot, target, releaseId, env = process.env) {
  if (!snapshot || snapshot.target !== target || !snapshot.values || typeof snapshot.values !== 'object') {
    throw new Error('Invalid previous storage environment');
  }
  const restored = { ...env, NEON_RELEASE_ID: releaseId };
  for (const key of storageKeys) delete restored[key];
  for (const [key, value] of Object.entries(snapshot.values)) {
    if (!storageKeys.includes(key) || typeof value !== 'string') throw new Error('Invalid previous storage setting');
    restored[key] = value;
  }
  return restored;
}

module.exports = { validateStoragePaths, captureStorageEnvironment, rollbackEnvironment };

if (require.main === module) {
  try {
    const [mode, target, releaseId] = process.argv.slice(2);
    if (mode === 'validate') {
      validateStoragePaths();
    } else if (mode === 'capture') {
      // Only allowlisted storage paths leave this parser; PM2's secret-bearing JSON stays on stdin.
      const processes = JSON.parse(fs.readFileSync(0, 'utf8'));
      process.stdout.write(JSON.stringify(captureStorageEnvironment(processes, target)));
    } else if (mode === 'rollback') {
      const snapshot = JSON.parse(fs.readFileSync(0, 'utf8'));
      const result = spawnSync('pm2', ['start', path.join(target, 'ecosystem.config.cjs'), '--update-env'], {
        env: rollbackEnvironment(snapshot, target, releaseId), stdio: 'inherit',
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } else {
      throw new Error('Expected validate, capture, or rollback');
    }
  } catch (error) {
    console.error(`Deployment storage environment check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
