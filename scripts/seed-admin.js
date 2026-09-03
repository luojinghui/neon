#!/usr/bin/env node

const readline = require('readline');
const mongoose = require('mongoose');
const { AdminUser } = require('../src/server/models/admin');
const { hashPassword, normalizeUsername } = require('../src/server/admin/auth');

function option(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function readLine(prompt) {
  const interface = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => interface.question(prompt, (answer) => {
    interface.close();
    resolve(answer.trim());
  }));
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return readLine(prompt);
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('已取消'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const uri = option('uri') || process.env.MONGODB_URI || '';
  if (!uri) throw new Error('缺少 MONGODB_URI 或 --uri');

  const username = normalizeUsername(option('username') || process.env.ADMIN_SEED_USERNAME || (await readLine('Admin username: ')));
  const password = option('password-stdin')
    ? require('fs').readFileSync(0, 'utf8').replace(/[\r\n]+$/, '')
    : process.env.ADMIN_SEED_PASSWORD || (await readHidden('Admin password: '));
  if (username.length < 3) throw new Error('管理员账号至少 3 位');

  await mongoose.connect(uri, { authSource: new URL(uri).searchParams.get('authSource') || undefined });
  await AdminUser.init();
  const passwordHash = await hashPassword(password);
  const admin = await AdminUser.findOneAndUpdate(
    { username },
    {
      $set: {
        displayName: '超级管理员',
        passwordHash,
        role: 'super_admin',
        enabled: true,
        sessionIdHash: '',
        sessionExpiresAt: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const databaseName = mongoose.connection.db?.databaseName || 'unknown';
  console.log(`Admin ${admin.username} is ready in ${databaseName}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
