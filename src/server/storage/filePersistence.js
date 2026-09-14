const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const COORDINATORS_KEY = Symbol.for('neon.file-persistence.coordinators.v1');
const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 60_000;

function coordinators() {
  if (!globalThis[COORDINATORS_KEY]) globalThis[COORDINATORS_KEY] = new Map();
  return globalThis[COORDINATORS_KEY];
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function acquireLock(dataFile) {
  const lockFile = `${dataFile}.lock`;
  const startedAt = Date.now();
  await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });

  while (true) {
    try {
      const handle = await fs.promises.open(lockFile, 'wx', 0o600);
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`, 'utf8');
      return async () => {
        await handle.close().catch(() => undefined);
        await fs.promises.unlink(lockFile).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      try {
        const stat = await fs.promises.stat(lockFile);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.promises.unlink(lockFile);
          continue;
        }
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }

      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        const timeoutError = new Error(`Timed out waiting for storage lock: ${lockFile}`);
        timeoutError.code = 'STORAGE_LOCK_TIMEOUT';
        throw timeoutError;
      }
      await wait(25);
    }
  }
}

function runFileExclusive(dataFile, task) {
  const key = path.resolve(dataFile);
  const queues = coordinators();
  const previous = queues.get(key) || Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const release = await acquireLock(key);
      try {
        return await task();
      } finally {
        await release();
      }
    });
  const settled = operation.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return operation;
}

async function writeFileAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  const tempFile = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.mkdir(directory, { recursive: true });
  let handle;
  try {
    handle = await fs.promises.open(tempFile, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(tempFile, filePath);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.promises.unlink(tempFile).catch((error) => {
      if (error.code !== 'ENOENT') console.error('Temporary storage file could not be removed:', error.message);
    });
  }
}

module.exports = { runFileExclusive, writeFileAtomic };
