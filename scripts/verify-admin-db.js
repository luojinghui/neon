#!/usr/bin/env node

const mongoose = require('mongoose');

function option(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

async function main() {
  const uri = option('uri') || process.env.MONGODB_URI || '';
  const username = (option('username') || process.env.ADMIN_SEED_USERNAME || '').trim().toLowerCase();
  if (!uri || !username) throw new Error('缺少数据库连接或管理员账号');

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('admin_users');
  await collection.createIndex({ username: 1 }, { unique: true, name: 'username_1' });
  const admin = await collection.findOne(
    { username },
    { projection: { username: 1, role: 1, enabled: 1, passwordHash: 1 } }
  );
  if (!admin) throw new Error('管理员记录不存在');
  if (admin.role !== 'super_admin' || admin.enabled !== true) throw new Error('管理员角色或状态无效');
  if (!/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(admin.passwordHash || '')) throw new Error('管理员密码摘要格式无效');

  const databaseName = mongoose.connection.db?.databaseName || 'unknown';
  console.log(`Admin ${admin.username} and unique index verified in ${databaseName}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
