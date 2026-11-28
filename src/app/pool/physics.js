/** 中式八球的球台尺寸、击球和台呢滚动。坐标系：x 指向顶库，z 指向右侧长库，y 向上。 */

const BALL_DIAMETER = 0.05715;
const BALL_RADIUS = BALL_DIAMETER / 2;
const BALL_MASS = 0.163;
const TABLE_LENGTH = 2.54;
const TABLE_WIDTH = 1.27;
const GRAVITY = 9.80665;
const MU_SLIDE = 0.2;
const MU_ROLL = 0.095;
const MU_CUSHION = 0.32;
const E_BALL = 0.96;
const E_CUSHION = 0.74;
const MU_BALL = 0.045;
const INERTIA = 0.4 * BALL_MASS * BALL_RADIUS * BALL_RADIUS;
const HALF_LENGTH = TABLE_LENGTH / 2;
const HALF_WIDTH = TABLE_WIDTH / 2;
const CORNER_GAP = 0.098;
const SIDE_GAP = 0.055;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createBall(id, x, z) {
  return {
    id,
    x,
    z,
    vx: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    pocketed: false,
    offTable: false
  };
}

function cloneBall(ball) {
  return { ...ball };
}

/** 用杆头击点给出线速度和旋转。offsetY 正值是高杆，offsetX 正值是右侧加塞。 */
function strike(ball, shot) {
  const speed = Math.max(0, shot.speed || 0);
  const offsetX = clamp(shot.offsetX || 0, -1, 1);
  const offsetY = clamp(shot.offsetY || 0, -1, 1);
  const elevation = clamp(shot.elevation || 0, 0, 0.45);
  const angle = shot.angle || 0;
  const reach = 0.5 * BALL_RADIUS;
  const horizontal = offsetX * reach;
  const vertical = offsetY * reach;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const rightX = dz;
  const rightZ = -dx;
  const forward = speed * Math.cos(elevation);
  ball.vx = dx * forward;
  ball.vz = dz * forward;
  const scale = forward / (0.4 * BALL_RADIUS * BALL_RADIUS);
  ball.wx = scale * vertical * rightX;
  ball.wy = scale * -horizontal;
  ball.wz = scale * vertical * rightZ;
  const curve = (horizontal / BALL_RADIUS) * Math.sin(elevation) * forward * 0.5;
  ball.vx += rightX * curve;
  ball.vz += rightZ * curve;
}

function pointVelocity(ball, rx, ry, rz) {
  return {
    vx: ball.vx + (ball.wy * rz - ball.wz * ry),
    vz: ball.vz + (ball.wx * ry - ball.wy * rx)
  };
}

function applyImpulse(ball, rx, ry, rz, ix, iy, iz) {
  ball.vx += ix / BALL_MASS;
  ball.vz += iz / BALL_MASS;
  const tx = ry * iz - rz * iy;
  const ty = rz * ix - rx * iz;
  const tz = rx * iy - ry * ix;
  ball.wx += tx / INERTIA;
  ball.wy += ty / INERTIA;
  ball.wz += tz / INERTIA;
}

function resolveBallCollision(a, b, params = {}) {
  if (!a || !b || a.pocketed || b.pocketed) return false;
  const restitution = params.restitution ?? E_BALL;
  const friction = params.friction ?? MU_BALL;
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-9) {
    dx = 1;
    dz = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const penetration = BALL_RADIUS * 2 - dist;
  if (penetration < -1e-7) return false;
  if (penetration > 0) {
    const push = penetration / 2;
    a.x -= nx * push;
    a.z -= nz * push;
    b.x += nx * push;
    b.z += nz * push;
  }
  const rax = nx * BALL_RADIUS;
  const raz = nz * BALL_RADIUS;
  const va = pointVelocity(a, rax, 0, raz);
  const vb = pointVelocity(b, -rax, 0, -raz);
  const relativeX = vb.vx - va.vx;
  const relativeZ = vb.vz - va.vz;
  const normalSpeed = relativeX * nx + relativeZ * nz;
  if (normalSpeed >= -1e-5) return false;
  const normalImpulse = -(1 + restitution) * normalSpeed * BALL_MASS / 2;
  let tangentX = relativeX - normalSpeed * nx;
  let tangentZ = relativeZ - normalSpeed * nz;
  const tangentSpeed = Math.hypot(tangentX, tangentZ);
  let frictionX = 0;
  let frictionZ = 0;
  if (tangentSpeed > 1e-6 && friction > 0) {
    const cancel = tangentSpeed * BALL_MASS / 7;
    const frictionImpulse = Math.min(cancel, friction * normalImpulse);
    frictionX = -tangentX / tangentSpeed * frictionImpulse;
    frictionZ = -tangentZ / tangentSpeed * frictionImpulse;
  }
  applyImpulse(b, -rax, 0, -raz, nx * normalImpulse + frictionX, 0, nz * normalImpulse + frictionZ);
  applyImpulse(a, rax, 0, raz, -nx * normalImpulse - frictionX, 0, -nz * normalImpulse - frictionZ);
  return true;
}

function resolveCushion(ball, nx, nz, penetration, cushions) {
  ball.x += nx * penetration;
  ball.z += nz * penetration;
  const inwardSpeed = ball.vx * nx + ball.vz * nz;
  if (inwardSpeed >= -0.03) {
    if (inwardSpeed < 0) {
      ball.vx -= inwardSpeed * nx;
      ball.vz -= inwardSpeed * nz;
    }
    return;
  }
  const rx = -nx * BALL_RADIUS;
  const rz = -nz * BALL_RADIUS;
  const contact = pointVelocity(ball, rx, 0, rz);
  const contactNormal = contact.vx * nx + contact.vz * nz;
  let tangentX = contact.vx - contactNormal * nx;
  let tangentZ = contact.vz - contactNormal * nz;
  const tangentSpeed = Math.hypot(tangentX, tangentZ);
  const normalImpulse = -(1 + E_CUSHION) * inwardSpeed * BALL_MASS;
  let frictionX = 0;
  let frictionZ = 0;
  if (tangentSpeed > 1e-5) {
    const cancel = tangentSpeed * BALL_MASS / 3.5;
    const frictionImpulse = Math.min(cancel, MU_CUSHION * normalImpulse);
    frictionX = -tangentX / tangentSpeed * frictionImpulse;
    frictionZ = -tangentZ / tangentSpeed * frictionImpulse;
  }
  applyImpulse(ball, rx, 0, rz, nx * normalImpulse + frictionX, 0, nz * normalImpulse + frictionZ);
  cushions.add(ball.id);
}

function pocketBall(ball, pocketed) {
  if (ball.pocketed) return;
  ball.pocketed = true;
  ball.vx = 0;
  ball.vz = 0;
  ball.wx = 0;
  ball.wy = 0;
  ball.wz = 0;
  pocketed.push(ball.id);
}

function resolveTable(ball, events) {
  if (ball.pocketed) return;
  const limitX = HALF_LENGTH - BALL_RADIUS;
  const limitZ = HALF_WIDTH - BALL_RADIUS;
  const cornerX = HALF_LENGTH - CORNER_GAP;
  const cornerZ = HALF_WIDTH - CORNER_GAP;
  const ax = Math.abs(ball.x);
  const az = Math.abs(ball.z);
  const sideMouth = ax <= SIDE_GAP;
  const cornerAlongLength = ax >= cornerX;
  const cornerAlongWidth = az >= cornerZ;

  if ((ball.z > limitZ || ball.z < -limitZ) && (sideMouth || cornerAlongLength)) {
    pocketBall(ball, events.pocketed);
    return;
  }
  if ((ball.x > limitX || ball.x < -limitX) && cornerAlongWidth) {
    pocketBall(ball, events.pocketed);
    return;
  }
  if (ax > HALF_LENGTH + 0.08 || az > HALF_WIDTH + 0.08) {
    ball.pocketed = true;
    ball.offTable = true;
    ball.vx = 0;
    ball.vz = 0;
    events.offTable.push(ball.id);
    return;
  }
  if (ball.z > limitZ) resolveCushion(ball, 0, -1, ball.z - limitZ, events.cushions);
  else if (ball.z < -limitZ) resolveCushion(ball, 0, 1, -limitZ - ball.z, events.cushions);
  if (ball.x > limitX) resolveCushion(ball, -1, 0, ball.x - limitX, events.cushions);
  else if (ball.x < -limitX) resolveCushion(ball, 1, 0, -limitX - ball.x, events.cushions);
}

function integrateBall(ball, dt) {
  if (ball.pocketed) return;
  const slipX = ball.vx + BALL_RADIUS * ball.wz;
  const slipZ = ball.vz - BALL_RADIUS * ball.wx;
  const slip = Math.hypot(slipX, slipZ);
  const speed = Math.hypot(ball.vx, ball.vz);
  if (slip > 0.012) {
    const ax = -MU_SLIDE * GRAVITY * slipX / slip;
    const az = -MU_SLIDE * GRAVITY * slipZ / slip;
    ball.vx += ax * dt;
    ball.vz += az * dt;
    ball.wx += -az / (0.4 * BALL_RADIUS) * dt;
    ball.wz += ax / (0.4 * BALL_RADIUS) * dt;
    ball.wy *= Math.exp(-dt * 0.3);
  } else if (speed > 0.012) {
    const ax = -MU_ROLL * GRAVITY * ball.vx / speed;
    const az = -MU_ROLL * GRAVITY * ball.vz / speed;
    ball.vx += ax * dt;
    ball.vz += az * dt;
    ball.wx = ball.vz / BALL_RADIUS;
    ball.wz = -ball.vx / BALL_RADIUS;
    ball.wy *= Math.exp(-dt * 1.4);
  } else {
    ball.vx = 0;
    ball.vz = 0;
    ball.wx = 0;
    ball.wz = 0;
    ball.wy *= Math.exp(-dt * 2);
  }
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const iw = -ball.wx * ball.qx - ball.wy * ball.qy - ball.wz * ball.qz;
  const ix = ball.wx * ball.qw + ball.wy * ball.qz - ball.wz * ball.qy;
  const iy = ball.wy * ball.qw + ball.wz * ball.qx - ball.wx * ball.qz;
  const iz = ball.wz * ball.qw + ball.wx * ball.qy - ball.wy * ball.qx;
  ball.qw += dt * 0.5 * iw;
  ball.qx += dt * 0.5 * ix;
  ball.qy += dt * 0.5 * iy;
  ball.qz += dt * 0.5 * iz;
  const scale = Math.hypot(ball.qw, ball.qx, ball.qy, ball.qz) || 1;
  ball.qw /= scale;
  ball.qx /= scale;
  ball.qy /= scale;
  ball.qz /= scale;
}

function resting(ball) {
  return ball.pocketed || (
    Math.hypot(ball.vx, ball.vz) < 0.014
    && Math.hypot(ball.wx, ball.wz) < 1.2
    && Math.abs(ball.wy) < 2
  );
}

function powerToSpeed(power) {
  const amount = clamp(power, 0, 1);
  return 0.4 + Math.pow(amount, 1.45) * 7.35;
}

function directionAngle(ax, az, bx, bz) {
  const magnitude = Math.hypot(ax, az) * Math.hypot(bx, bz);
  if (magnitude < 1e-8) return null;
  return Math.acos(clamp((ax * bx + az * bz) / magnitude, -1, 1)) * 180 / Math.PI;
}

function simulateShot(balls, options = {}) {
  const dt = options.dt ?? 1 / 360;
  const maxTime = options.maxTime ?? 9;
  const sampleDt = options.sampleDt ?? 1 / 60;
  const world = balls.map(cloneBall);
  if (options.shot) {
    const cue = world.find(ball => ball.id === 0);
    if (cue && !cue.pocketed) strike(cue, options.shot);
  }
  const events = { pocketed: [], cushions: new Set(), offTable: [] };
  const cue = world.find(ball => ball.id === 0);
  const frozenTargets = cue ? world.filter(ball => (
    ball.id !== 0 && !ball.pocketed && Math.hypot(ball.x - cue.x, ball.z - cue.z) <= BALL_RADIUS * 2 + 0.0015
  )).map(ball => ({ id: ball.id, x: ball.x, z: ball.z })) : [];
  let firstContact = null;
  let contact = null;
  let cutAngle = null;
  let separation = null;
  let contactMark = null;
  let objectBlocked = false;
  const samples = [];
  let elapsed = 0;
  let sinceSample = sampleDt;
  const steps = Math.ceil(maxTime / dt);

  for (let step = 0; step < steps; step += 1) {
    for (const ball of world) integrateBall(ball, dt);
    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 0; i < world.length; i += 1) {
        for (let j = i + 1; j < world.length; j += 1) {
          const a = world[i];
          const b = world[j];
          const strikerBefore = a.id === 0 ? a : b.id === 0 ? b : null;
          const incomingX = strikerBefore ? strikerBefore.vx : 0;
          const incomingZ = strikerBefore ? strikerBefore.vz : 0;
          if (!resolveBallCollision(a, b)) continue;
          const other = a.id === 0 ? b : b.id === 0 ? a : null;
          const striker = other && (a.id === 0 ? a : b);
          if (firstContact != null && a.id !== 0 && b.id !== 0 && (a.id === firstContact || b.id === firstContact)) {
            objectBlocked = true;
          }
          if (!striker || firstContact != null) continue;
          firstContact = other.id;
          const normalX = other.x - striker.x;
          const normalZ = other.z - striker.z;
          const normalLength = Math.hypot(normalX, normalZ) || 1;
          contact = {
            x: (striker.x + other.x) / 2,
            z: (striker.z + other.z) / 2
          };
          const speed = Math.hypot(incomingX, incomingZ);
          if (speed > 0.05) {
            cutAngle = Math.acos(clamp((incomingX * normalX + incomingZ * normalZ) / (speed * normalLength), -1, 1)) * 180 / Math.PI;
          }
          contactMark = { t: elapsed, id: other.id, cueX: striker.x, cueZ: striker.z, ballX: other.x, ballZ: other.z };
        }
      }
    }
    for (const ball of world) resolveTable(ball, events);
    if (contactMark && separation == null && !objectBlocked && elapsed - contactMark.t >= 0.24) {
      const striker = world.find(ball => ball.id === 0);
      const other = world.find(ball => ball.id === contactMark.id);
      if (striker && other) {
        separation = directionAngle(
          striker.x - contactMark.cueX,
          striker.z - contactMark.cueZ,
          other.x - contactMark.ballX,
          other.z - contactMark.ballZ
        );
      }
    }
    elapsed += dt;
    sinceSample += dt;
    if (sinceSample >= sampleDt) {
      sinceSample = 0;
      samples.push({
        t: elapsed,
        balls: world.map(ball => ({
          id: ball.id,
          x: ball.x,
          z: ball.z,
          pocketed: ball.pocketed,
          qx: ball.qx,
          qy: ball.qy,
          qz: ball.qz,
          qw: ball.qw
        }))
      });
    }
    if (world.every(resting)) break;
  }

  if (contactMark && separation == null && !objectBlocked) {
    const striker = world.find(ball => ball.id === 0);
    const other = world.find(ball => ball.id === contactMark.id);
    if (striker && other) {
      separation = directionAngle(
        striker.x - contactMark.cueX,
        striker.z - contactMark.cueZ,
        other.x - contactMark.ballX,
        other.z - contactMark.ballZ
      );
    }
  }
  for (const ball of world) {
    if (resting(ball) && !ball.pocketed) {
      ball.vx = 0;
      ball.vz = 0;
      ball.wx = 0;
      ball.wy = 0;
      ball.wz = 0;
    }
  }
  const frozen = frozenTargets.some(target => {
    const ball = world.find(item => item.id === target.id);
    return ball && !ball.pocketed && Math.hypot(ball.x - target.x, ball.z - target.z) < 0.0015;
  });

  return {
    balls: world,
    samples,
    pocketed: events.pocketed,
    cushions: [...events.cushions],
    offTable: events.offTable,
    firstContact,
    contact,
    cutAngle,
    separation,
    frozen
  };
}

module.exports = {
  BALL_RADIUS,
  BALL_DIAMETER,
  BALL_MASS,
  TABLE_LENGTH,
  TABLE_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  createBall,
  cloneBall,
  strike,
  powerToSpeed,
  resolveBallCollision,
  simulateShot
};
