const assert = require('node:assert/strict');
const test = require('node:test');
const {
  BALL_RADIUS,
  createBall,
  strike,
  resolveBallCollision,
  simulateShot
} = require('./physics');

const R = BALL_RADIUS;

function angleBetween(ax, az, bx, bz) {
  const mag = Math.hypot(ax, az) * Math.hypot(bx, bz);
  if (mag < 1e-8) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / mag))) * 180 / Math.PI;
}

test('正碰定杆时母球几乎停住，目标球带走速度', () => {
  const cue = createBall(0, -0.4, 0);
  const object = createBall(1, -0.4 + R * 2 + 0.002, 0);
  strike(cue, { angle: 0, speed: 2, offsetX: 0, offsetY: 0 });
  const result = simulateShot([cue, object], { maxTime: 0.08, dt: 1 / 480 });
  const doneCue = result.balls.find(ball => ball.id === 0);
  const doneObject = result.balls.find(ball => ball.id === 1);
  assert.ok(doneObject.vx > 1.7, `目标球速度 ${doneObject.vx}`);
  assert.ok(Math.hypot(doneCue.vx, doneCue.vz) < 0.25, `母球残留速度 ${doneCue.vx}`);
});

test('无摩擦切球的分离角接近 90 度', () => {
  const cut = Math.PI / 6;
  const cue = createBall(0, -Math.cos(cut) * R * 2, -Math.sin(cut) * R * 2);
  const object = createBall(1, 0, 0);
  cue.vx = 2;
  cue.x += 0.0002;
  resolveBallCollision(cue, object, { restitution: 1, friction: 0 });
  const separation = angleBetween(cue.vx, cue.vz, object.vx, object.vz);
  assert.ok(separation > 86 && separation < 94, `分离角 ${separation}`);
  const objectAngle = Math.atan2(object.vz, object.vx);
  assert.ok(Math.abs(objectAngle - cut) < 0.04, `目标球方向 ${objectAngle}，切角 ${cut}`);
});

test('滑动母球切球时目标球被抛向来球方向', () => {
  const cut = Math.PI / 6;
  const cue = createBall(0, -Math.cos(cut) * R * 2, -Math.sin(cut) * R * 2);
  const object = createBall(1, 0, 0);
  cue.vx = 2.4;
  cue.x += 0.0002;
  resolveBallCollision(cue, object, { restitution: 0.98, friction: 0.2 });
  const objectAngle = Math.atan2(object.vz, object.vx);
  assert.ok(objectAngle < cut - 0.01, `抛球后角度 ${objectAngle} 应小于切角 ${cut}`);
});

test('高杆正碰后母球继续向前，低杆正碰后母球回头', () => {
  const place = () => {
    const cue = createBall(0, -0.45, 0);
    const object = createBall(1, -0.45 + R * 2 + 0.004, 0);
    return [cue, object];
  };
  const followBalls = place();
  strike(followBalls[0], { angle: 0, speed: 2.2, offsetX: 0, offsetY: 0.85 });
  const follow = simulateShot(followBalls, { maxTime: 0.7, dt: 1 / 360 });
  const followCue = follow.balls.find(ball => ball.id === 0);
  assert.ok(followCue.x > -0.45 + 0.08, `高杆母球位置 ${followCue.x}`);

  const drawBalls = place();
  strike(drawBalls[0], { angle: 0, speed: 2.2, offsetX: 0, offsetY: -1 });
  const draw = simulateShot(drawBalls, { maxTime: 0.7, dt: 1 / 360 });
  const drawCue = draw.balls.find(ball => ball.id === 0);
  assert.ok(drawCue.x < -0.45 - 0.04, `低杆母球位置 ${drawCue.x}`);
});

test('加塞改变库边反弹角', () => {
  const rebound = wy => {
    const ball = createBall(1, 0, 0.42);
    ball.vx = 1.1;
    ball.vz = 1.6;
    ball.wy = wy;
    const result = simulateShot([ball], { maxTime: 0.45, dt: 1 / 480 });
    const done = result.balls[0];
    assert.ok(done.z < 0.5, '球应从顶库弹回');
    return Math.atan2(Math.abs(done.vz), done.vx);
  };
  const plain = rebound(0);
  const running = rebound(-70);
  const reversing = rebound(70);
  assert.ok(Math.abs(running - plain) > 0.04 || Math.abs(reversing - plain) > 0.04, `平击 ${plain}，顺塞 ${running}，反塞 ${reversing}`);
  assert.ok(Math.abs(running - reversing) > 0.08, `左右塞应明显不同：${running} / ${reversing}`);
});

test('对准袋口会进袋，打在库边中部会弹回', () => {
  const pocket = createBall(3, 0.72, 0.28);
  const mouthX = 1.27;
  const mouthZ = 0.635;
  const aim = Math.atan2(mouthZ - pocket.z, mouthX - pocket.x);
  strike(pocket, { angle: aim, speed: 2.4, offsetX: 0, offsetY: 0 });
  const pocketed = simulateShot([pocket], { maxTime: 1.2, dt: 1 / 480 });
  assert.equal(pocketed.balls[0].pocketed, true);
  assert.ok(pocketed.pocketed.includes(3));

  const rail = createBall(4, 0.46, 0);
  strike(rail, { angle: Math.PI / 2, speed: 2, offsetX: 0, offsetY: 0 });
  const bounced = simulateShot([rail], { maxTime: 0.8, dt: 1 / 480 });
  assert.equal(bounced.balls[0].pocketed, false);
  assert.ok(bounced.balls[0].z < 0.55, `弹回后的 z=${bounced.balls[0].z}`);
  assert.ok(bounced.cushions.includes(4));
});

test('轻微切球会给出切角，定杆分离角接近直角', () => {
  const cue = createBall(0, -0.5, 0);
  const object = createBall(1, -0.5 + R * 2 + 0.02, 0.03);
  const result = simulateShot([cue, object], {
    shot: { angle: 0, speed: 2.1, offsetX: 0, offsetY: 0 },
    maxTime: 0.7,
    dt: 1 / 360
  });
  assert.ok(result.cutAngle != null && result.cutAngle > 2 && result.cutAngle < 35, `切角 ${result.cutAngle}`);
  assert.ok(result.separation != null && result.separation > 70 && result.separation < 115, `分离角 ${result.separation}`);
});

test('滚动的球会在台呢上停住', () => {
  const ball = createBall(1, 0, 0);
  strike(ball, { angle: 0, speed: 1.4, offsetX: 0, offsetY: 0.8 });
  const result = simulateShot([ball], { maxTime: 8, dt: 1 / 240 });
  const done = result.balls[0];
  assert.ok(Math.hypot(done.vx, done.vz) < 0.02, `残留速度 ${done.vx}`);
  assert.ok(done.x > 0.4 && done.x < 2, `滚动距离 ${done.x}`);
  assert.equal(done.pocketed, false);
});
