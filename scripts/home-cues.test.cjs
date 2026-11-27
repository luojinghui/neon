const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports }, { filename });
  return exports;
}

const root = path.resolve(__dirname, '..');
const cues = load(path.join(root, 'src/app/home/cues.ts'));
const orbit = load(path.join(root, 'src/app/home/orbit.ts'));
const now = new Date('2026-11-27T10:00:00');

test('有人的房间优先于仅仅最近聊过的房间', () => {
  const result = cues.buildHomeCues({
    now,
    rooms: [
      { id: 'quiet', name: '夜航', onlineCount: 0, lastMessageAt: '2026-11-27T09:00:00' },
      { id: 'busy', name: '港口', onlineCount: 3, lastMessageAt: '2026-11-26T09:00:00' }
    ]
  });
  assert.equal(result.soul.detail, '3 个人正在「港口」');
  assert.equal(result.soul.href, '/soul/busy');
  assert.equal(result.soul.action, '去看看');
});

test('没有人在线时回到最近聊过的房间', () => {
  const result = cues.buildHomeCues({
    now,
    rooms: [{ id: 'harbor', name: '港口', onlineCount: 0, lastMessageAt: '2026-11-27T08:00:00' }]
  });
  assert.equal(result.soul.detail, '最近在「港口」聊过');
  assert.equal(result.soul.action, '回到那里');
});

test('私聊和没有时间的空房间不拿来当理由', () => {
  const result = cues.buildHomeCues({
    now,
    rooms: [
      { id: 'dm', name: '阿星', kind: 'direct', onlineCount: 2, lastMessageAt: '2026-11-27T09:00:00' },
      { id: 'empty', name: '空岛', onlineCount: 0 }
    ]
  });
  assert.equal(result.soul.detail, '');
  assert.equal(result.soul.action, '去星球看看谁在');
  assert.equal(result.soul.href, '/soul');
});

test('今天的星语会写进理由，更早的不会', () => {
  const today = cues.buildHomeCues({
    now,
    moments: [
      { createdAt: '2026-11-27T01:00:00', text: '午后的风很轻' },
      { createdAt: '2026-11-27T00:30:00', text: '另一句' },
      { createdAt: '2026-11-26T12:00:00', text: '昨天' }
    ]
  });
  assert.equal(today.moments.detail, '今天新亮了 2 颗星');
  assert.equal(today.moments.href, '/moments');

  const older = cues.buildHomeCues({
    now,
    moments: [{ createdAt: '2026-11-26T12:00:00', text: '昨天' }]
  });
  assert.equal(older.moments.detail, '');
  assert.equal(older.moments.action, '留下一句星语');
});

test('云传只把今天传出的文字当成理由', () => {
  const fresh = cues.buildHomeCues({
    now,
    cloud: { text: '路由器密码在第二行', timestamp: now.getTime() - 60_000 }
  });
  assert.equal(fresh.cloud.detail, '今天传过「路由器密码在第二行」');
  assert.equal(fresh.cloud.action, '再补一点');

  const stale = cues.buildHomeCues({
    now,
    cloud: { text: '昨天的', timestamp: now.getTime() - 48 * 60 * 60 * 1000 }
  });
  assert.equal(stale.cloud.detail, '');
  assert.equal(stale.cloud.href, '/cloud');
});

test('浮岛优先说谁在，其次说拼贴数量', () => {
  const online = cues.buildHomeCues({
    island: { id: 'isle-1', name: '橘岛', onlineCount: 2, itemCount: 4 }
  });
  assert.equal(online.island.detail, '2 个人在「橘岛」');
  assert.equal(online.island.href, '/island/isle-1');

  const pasted = cues.buildHomeCues({
    island: { id: 'isle-1', name: '橘岛', onlineCount: 0, itemCount: 4 }
  });
  assert.equal(pasted.island.detail, '「橘岛」上有 4 张拼贴');

  const empty = cues.buildHomeCues({
    island: { id: 'isle-1', name: '橘岛', onlineCount: 0, itemCount: 0 }
  });
  assert.equal(empty.island.action, '去浮岛贴一张');
});

test('画镜提到最近的作品，入口仍回到创作页', () => {
  const result = cues.buildHomeCues({
    now,
    doodle: { id: 'draw-1', title: '午后漫画', createdAt: '2026-11-27T02:00:00', state: 'active' }
  });
  assert.equal(result.doodle.detail, '今天画过「午后漫画」');
  assert.equal(result.doodle.href, '/doodle');

  const expired = cues.buildHomeCues({
    now,
    doodle: { id: 'draw-1', title: '过期', createdAt: '2026-11-27T02:00:00', state: 'expired' }
  });
  assert.equal(expired.doodle.detail, '');
});

test('轨道线接到卡片朝向星球的一边', () => {
  const planet = { x: 500, y: 280 };
  const card = { x: 700, y: 80, w: 200, h: 70 };
  const edge = orbit.cardEdgeToward(card, planet);
  assert.equal(edge.y, 150);
  assert.ok(edge.x > 700 && edge.x < 900);

  const tether = orbit.buildTether(planet, card, 40);
  assert.ok(tether.d.startsWith('M '));
  assert.ok(tether.d.endsWith(`${edge.x} ${edge.y}`));
  const start = Number(tether.d.split(' ')[1]);
  assert.ok(start > planet.x);
  assert.equal(orbit.buildTether(planet, { x: 0, y: 0, w: 0, h: 40 }), null);
});
