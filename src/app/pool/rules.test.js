const assert = require('node:assert/strict');
const test = require('node:test');
const { BALL_RADIUS, TABLE_LENGTH } = require('./physics');
const { createGame, resolveShot, placeCue, choose } = require('./rules');

const R = BALL_RADIUS;
const HEAD = TABLE_LENGTH / 2 - 0.635;

function ball(id, x, z, extra = {}) {
  return {
    id, x, z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    pocketed: false,
    ...extra
  };
}

function resting(game, patches = {}) {
  return game.balls.map(item => ball(item.id, item.x, item.z, { pocketed: item.pocketed, ...patches[item.id] }));
}

test('开局按中八摆球：8 号在三角中心，底角一全色一花色，母球在开球区', () => {
  const game = createGame();
  assert.equal(game.balls.length, 16);
  assert.equal(game.open, true);
  assert.equal(game.isBreak, true);
  assert.equal(game.current, 0);
  assert.equal(game.ballInHand, 'kitchen');
  const ids = game.balls.map(item => item.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [...Array(16).keys()]);
  const eight = game.balls.find(item => item.id === 8);
  const row = Math.sqrt(3) * R;
  assert.ok(Math.abs(eight.x - (HEAD + row * 2)) < 1e-6, `8 号 x=${eight.x}`);
  assert.ok(Math.abs(eight.z) < 1e-6);
  const apex = game.balls.find(item => Math.abs(item.x - HEAD) < 1e-6 && Math.abs(item.z) < 1e-6 && item.id !== 0);
  assert.ok(apex, '置球点上应有一颗目标球');
  const backX = HEAD + row * 4;
  const corners = game.balls.filter(item => Math.abs(item.x - backX) < 1e-6 && Math.abs(Math.abs(item.z) - R * 4) < 1e-6);
  assert.equal(corners.length, 2);
  assert.ok((corners[0].id < 8) !== (corners[1].id < 8), '底边两端应分属全色和花色');
  const cue = game.balls.find(item => item.id === 0);
  assert.ok(cue.x <= -0.635 && cue.x >= -TABLE_LENGTH / 2 + R);
  for (let i = 0; i < game.balls.length; i += 1) {
    for (let j = i + 1; j < game.balls.length; j += 1) {
      const a = game.balls[i];
      const b = game.balls[j];
      const gap = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(gap >= R * 2 - 1e-4, `${a.id} 与 ${b.id} 重叠 ${gap}`);
    }
  }
});

test('开球进球后继续击球，球局仍开放；8 号入袋要重置', () => {
  const game = createGame();
  const balls = resting(game);
  balls.find(item => item.id === 3).pocketed = true;
  balls.find(item => item.id === 8).pocketed = true;
  const next = resolveShot(game, {
    balls,
    pocketed: [3, 8],
    cushions: [1, 2],
    offTable: [],
    firstContact: 1
  });
  assert.equal(next.current, 0);
  assert.equal(next.open, true);
  assert.equal(next.groups[0], null);
  assert.equal(next.isBreak, false);
  assert.equal(next.phase, 'aim');
  const eight = next.balls.find(item => item.id === 8);
  assert.equal(eight.pocketed, false);
  assert.ok(Math.abs(eight.z) < 1e-6);
  assert.equal(next.balls.find(item => item.id === 3).pocketed, true);
});

test('开球没有进球且碰库不足四颗时，对手获得选择', () => {
  const game = createGame();
  const next = resolveShot(game, {
    balls: resting(game),
    pocketed: [],
    cushions: [1, 2, 3],
    offTable: [],
    firstContact: 1
  });
  assert.equal(next.phase, 'choice');
  assert.equal(next.choice.kind, 'break');
  const taken = choose(next, 'take');
  assert.equal(taken.current, 1);
  assert.equal(taken.ballInHand, 'table');
  assert.equal(taken.isBreak, false);
  assert.equal(taken.phase, 'aim');
});

test('开放球局合法打进选定花色才定组，打进另一组则换人且仍然开放', () => {
  const game = createGame();
  game.isBreak = false;
  game.ballInHand = null;
  const assigned = resolveShot(game, {
    balls: resting(game, { 9: { pocketed: true } }),
    pocketed: [9],
    cushions: [],
    offTable: [],
    firstContact: 10
  });
  assert.equal(assigned.open, false);
  assert.equal(assigned.groups[0], 'stripe');
  assert.equal(assigned.groups[1], 'solid');
  assert.equal(assigned.current, 0);

  const passed = resolveShot(game, {
    balls: resting(game, { 9: { pocketed: true } }),
    pocketed: [9],
    cushions: [9],
    offTable: [],
    firstContact: 1
  });
  assert.equal(passed.open, true);
  assert.equal(passed.current, 1);
  assert.equal(passed.balls.find(item => item.id === 9).pocketed, true);
});

test('定组后先碰对方球、母球落袋或未碰库都是自由球', () => {
  const game = createGame();
  game.isBreak = false;
  game.open = false;
  game.groups = ['solid', 'stripe'];
  game.ballInHand = null;
  const wrong = resolveShot(game, {
    balls: resting(game),
    pocketed: [],
    cushions: [0],
    offTable: [],
    firstContact: 9
  });
  assert.equal(wrong.current, 1);
  assert.equal(wrong.ballInHand, 'table');
  assert.match(wrong.message, /对方/);

  const scratchBalls = resting(game);
  scratchBalls.find(item => item.id === 0).pocketed = true;
  const scratch = resolveShot(game, {
    balls: scratchBalls,
    pocketed: [0],
    cushions: [1],
    offTable: [],
    firstContact: 1
  });
  assert.equal(scratch.ballInHand, 'table');
  assert.equal(scratch.current, 1);

  const noRail = resolveShot(game, {
    balls: resting(game),
    pocketed: [],
    cushions: [],
    offTable: [],
    firstContact: 1
  });
  assert.equal(noRail.ballInHand, 'table');
  assert.match(noRail.message, /碰库/);
});

test('清完本方球后合法打进 8 号获胜；提前打进、连同最后一颗打进或犯规打进都判负', () => {
  const ready = createGame();
  ready.isBreak = false;
  ready.open = false;
  ready.groups = ['solid', 'stripe'];
  ready.ballInHand = null;
  ready.balls.forEach(item => {
    if (item.id >= 1 && item.id <= 7) item.pocketed = true;
  });
  const win = resolveShot(ready, {
    balls: resting(ready, { 8: { pocketed: true } }),
    pocketed: [8],
    cushions: [],
    offTable: [],
    firstContact: 8
  });
  assert.equal(win.winner, 0);
  assert.equal(win.phase, 'over');

  const early = createGame();
  early.isBreak = false;
  early.open = false;
  early.groups = ['solid', 'stripe'];
  early.ballInHand = null;
  const lost = resolveShot(early, {
    balls: resting(early, { 8: { pocketed: true } }),
    pocketed: [8],
    cushions: [],
    offTable: [],
    firstContact: 1
  });
  assert.equal(lost.winner, 1);

  const together = createGame();
  together.isBreak = false;
  together.open = false;
  together.groups = ['solid', 'stripe'];
  together.ballInHand = null;
  together.balls.forEach(item => {
    if (item.id >= 1 && item.id <= 6) item.pocketed = true;
  });
  const sameShot = resolveShot(together, {
    balls: resting(together, { 7: { pocketed: true }, 8: { pocketed: true } }),
    pocketed: [7, 8],
    cushions: [],
    offTable: [],
    firstContact: 7
  });
  assert.equal(sameShot.winner, 1);

  const scratchOnEight = resolveShot(ready, {
    balls: resting(ready, { 0: { pocketed: true } }),
    pocketed: [0],
    cushions: [0],
    offTable: [],
    firstContact: 8
  });
  assert.equal(scratchOnEight.winner, null);
  assert.equal(scratchOnEight.ballInHand, 'table');
  assert.equal(scratchOnEight.current, 1);
});

test('自由球不能叠到其他球上，开球线后的母球不能放到线外', () => {
  const game = createGame();
  const eight = game.balls.find(item => item.id === 8);
  const blocked = placeCue(game, eight.x, eight.z);
  assert.equal(blocked.balls.find(item => item.id === 0).x, game.balls.find(item => item.id === 0).x);
  const outside = placeCue(game, 0, 0);
  assert.equal(outside.balls.find(item => item.id === 0).x, game.balls.find(item => item.id === 0).x);
  const placed = placeCue(game, -0.9, 0.1);
  assert.ok(Math.abs(placed.balls.find(item => item.id === 0).x + 0.9) < 1e-9);
  assert.equal(placed.ballInHand, 'kitchen');
});
