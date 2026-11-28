/** 中式八球一局的摆球、犯规、定组和 8 号胜负。物理结果由 resolveShot 接收。 */

const { BALL_RADIUS, TABLE_LENGTH, TABLE_WIDTH, createBall, cloneBall, simulateShot } = require('./physics');

const R = BALL_RADIUS;
const HEAD_SPOT = TABLE_LENGTH / 2 - 0.635;
const KITCHEN_LINE = -TABLE_LENGTH / 2 + 0.635;
const NAMES = ['甲方', '乙方'];
const RACK = [
  [1],
  [9, 2],
  [10, 8, 3],
  [11, 4, 12, 5],
  [7, 13, 6, 14, 15]
];

function playerName(index) {
  return NAMES[index] || '球员';
}

function rackBalls() {
  const balls = [];
  const rowGap = Math.sqrt(3) * R;
  RACK.forEach((row, rowIndex) => {
    row.forEach((id, column) => {
      balls.push(createBall(
        id,
        HEAD_SPOT + rowIndex * rowGap,
        (column - (row.length - 1) / 2) * R * 2
      ));
    });
  });
  balls.push(createBall(0, -0.95, 0));
  return balls.sort((a, b) => a.id - b.id);
}

function createGame() {
  return {
    balls: rackBalls(),
    phase: 'aim',
    current: 0,
    breaker: 0,
    open: true,
    groups: [null, null],
    ballInHand: 'kitchen',
    isBreak: true,
    breakWarning: false,
    message: '甲方开球。母球放在开球线后，打向球堆。',
    winner: null,
    choice: null
  };
}

function cloneState(state) {
  return {
    ...state,
    groups: [...state.groups],
    balls: state.balls.map(cloneBall),
    choice: state.choice ? { ...state.choice } : null
  };
}

function isSolid(id) {
  return id >= 1 && id <= 7;
}

function isStripe(id) {
  return id >= 9 && id <= 15;
}

function inGroup(id, group) {
  if (group === 'solid') return isSolid(id);
  if (group === 'stripe') return isStripe(id);
  return false;
}

function remaining(balls, group) {
  return balls.filter(ball => inGroup(ball.id, group) && !ball.pocketed).length;
}

function insideTable(x, z) {
  return x >= -TABLE_LENGTH / 2 + R && x <= TABLE_LENGTH / 2 - R
    && z >= -TABLE_WIDTH / 2 + R && z <= TABLE_WIDTH / 2 - R;
}

function canPlace(state, x, z) {
  if (!state.ballInHand || !insideTable(x, z)) return false;
  if (state.ballInHand === 'kitchen' && x > KITCHEN_LINE) return false;
  return state.balls.every(ball => (
    ball.id === 0 || ball.pocketed || Math.hypot(ball.x - x, ball.z - z) >= R * 2 - 1e-6
  ));
}

function placeCue(state, x, z) {
  if (!canPlace(state, x, z)) return state;
  const next = cloneState(state);
  const cue = next.balls.find(ball => ball.id === 0);
  cue.x = x;
  cue.z = z;
  cue.pocketed = false;
  cue.offTable = false;
  cue.vx = 0;
  cue.vz = 0;
  cue.wx = 0;
  cue.wy = 0;
  cue.wz = 0;
  return next;
}

function blocked(balls, x) {
  return balls.some(ball => ball.id !== 8 && !ball.pocketed && Math.hypot(ball.x - x, ball.z) < R * 2 + 0.0008);
}

function respotEight(balls) {
  const eight = balls.find(ball => ball.id === 8);
  if (!eight) return;
  const minX = -TABLE_LENGTH / 2 + R;
  const maxX = TABLE_LENGTH / 2 - R;
  const candidates = [HEAD_SPOT];
  const step = R * 0.5;
  for (let distance = step; HEAD_SPOT + distance <= maxX; distance += step) candidates.push(HEAD_SPOT + distance);
  for (let distance = step; HEAD_SPOT - distance >= minX; distance += step) candidates.push(HEAD_SPOT - distance);
  eight.x = candidates.find(candidate => !blocked(balls, candidate)) ?? 0;
  eight.z = 0;
  eight.pocketed = false;
  eight.offTable = false;
  eight.vx = 0;
  eight.vz = 0;
  eight.wx = 0;
  eight.wy = 0;
  eight.wz = 0;
}

function finish(next, winner, message) {
  next.phase = 'over';
  next.winner = winner;
  next.ballInHand = null;
  next.choice = null;
  next.message = message;
  return next;
}

function handOver(next, opponent, message, hand = 'table') {
  next.phase = 'aim';
  next.current = opponent;
  next.ballInHand = hand;
  next.choice = null;
  next.isBreak = false;
  next.message = message;
  const cue = next.balls.find(ball => ball.id === 0);
  if (cue?.pocketed || cue?.offTable) cue.pocketed = true;
  return next;
}

function resolveBreak(state, next, outcome) {
  const shooter = state.current;
  const opponent = 1 - shooter;
  const pocketed = outcome.pocketed || [];
  const objectPocketed = pocketed.filter(id => id >= 1 && id <= 15);
  const rails = new Set([
    ...(outcome.cushions || []),
    ...objectPocketed,
    ...((outcome.offTable || []).filter(id => id > 0))
  ]);
  const eightPocketed = pocketed.includes(8);
  const cueDown = pocketed.includes(0) || (outcome.offTable || []).includes(0);
  const objectOff = (outcome.offTable || []).some(id => id > 0);
  const legal = objectPocketed.length > 0 || [...rails].filter(id => id > 0).length >= 4;
  const foul = !outcome.firstContact || cueDown || objectOff || !legal || outcome.frozen;
  if (eightPocketed) respotEight(next.balls);

  if (foul && state.breakWarning) {
    return finish(next, opponent, `${playerName(shooter)}再次开球犯规，本局判负。`);
  }
  if (foul && eightPocketed) {
    next.phase = 'choice';
    next.choice = { kind: 'break-eight' };
    next.message = `开球时 8 号入袋并犯规。${playerName(opponent)}可以接着打，或拿线后自由球。`;
    return next;
  }
  if (foul) {
    next.phase = 'choice';
    next.choice = { kind: 'break' };
    next.message = `开球犯规。${playerName(opponent)}可以选择重开，或自由球打这一台。`;
    return next;
  }

  next.isBreak = false;
  next.open = true;
  next.phase = 'aim';
  next.ballInHand = null;
  next.breakWarning = false;
  if (objectPocketed.length > 0) {
    next.current = shooter;
    next.message = `开球进球，球局开放，${playerName(shooter)}继续。`;
  } else {
    next.current = opponent;
    next.message = `开球合法，换${playerName(opponent)}击球。球局仍开放。`;
  }
  return next;
}

function resolveShot(state, outcome) {
  const next = cloneState(state);
  const incoming = new Map((outcome.balls || []).map(ball => [ball.id, cloneBall(ball)]));
  next.balls = next.balls.map(ball => incoming.get(ball.id) || ball);
  if (state.isBreak) return resolveBreak(state, next, outcome);

  const shooter = state.current;
  const opponent = 1 - shooter;
  const pocketed = outcome.pocketed || [];
  const eightPocketed = pocketed.includes(8);
  const eightOff = (outcome.offTable || []).includes(8);
  const cueDown = pocketed.includes(0) || (outcome.offTable || []).includes(0);
  const objectOff = (outcome.offTable || []).filter(id => id > 0);
  const group = state.groups[shooter];
  const onEight = group != null && remaining(state.balls, group) === 0;
  const legalFirst = id => {
    if (id == null) return false;
    if (group == null) return id >= 1 && id <= 15 && id !== 8;
    if (onEight) return id === 8;
    return inGroup(id, group);
  };

  let reason = '';
  if (!outcome.firstContact) reason = '没有碰到目标球';
  else if (!legalFirst(outcome.firstContact)) reason = outcome.firstContact === 8 ? '还不能先碰 8 号' : '先碰到了对方的球';
  else if (cueDown) reason = '母球落袋';
  else if (objectOff.length > 0) reason = '目标球离台';
  else if (outcome.frozen) reason = '贴球没有拉开';
  else if (!pocketed.some(id => id >= 1 && id <= 15) && (outcome.cushions || []).length === 0) reason = '没有球碰库';
  const foul = reason !== '';

  if (eightOff) return finish(next, opponent, `${playerName(shooter)}将 8 号击离台面，本局输了。`);
  if (eightPocketed) {
    const stillHasGroup = group == null || remaining(state.balls, group) > 0;
    if (stillHasGroup || foul) {
      return finish(next, opponent, `${playerName(shooter)}打进 8 号的方式不合法，本局输了。`);
    }
    return finish(next, shooter, `${playerName(shooter)}打进 8 号，获胜。`);
  }
  if (foul) return handOver(next, opponent, `${playerName(shooter)}犯规：${reason}。${playerName(opponent)}自由球。`);

  if (state.open && outcome.firstContact && outcome.firstContact !== 8) {
    const nominated = outcome.firstContact < 8 ? 'solid' : 'stripe';
    if (pocketed.some(id => inGroup(id, nominated))) {
      next.open = false;
      next.groups[shooter] = nominated;
      next.groups[opponent] = nominated === 'solid' ? 'stripe' : 'solid';
    }
  }

  const ownGroup = next.groups[shooter];
  const scored = ownGroup != null && pocketed.some(id => inGroup(id, ownGroup));
  next.phase = 'aim';
  next.ballInHand = null;
  next.current = scored ? shooter : opponent;
  const openNote = next.open ? '球局仍开放。' : '';
  if (state.open && !next.open && scored) {
    next.message = `${playerName(shooter)}选定${ownGroup === 'solid' ? '全色' : '花色'}，继续击球。`;
  } else if (scored) {
    next.message = `进袋，${playerName(shooter)}继续。${openNote}`;
  } else {
    next.message = `换${playerName(opponent)}击球。${openNote}`;
  }
  return next;
}

function choose(state, option) {
  if (state.phase !== 'choice') return state;
  const opponent = 1 - state.current;
  if (state.choice?.kind === 'break' && option === 'take') {
    const next = cloneState(state);
    return handOver(next, opponent, `${playerName(opponent)}自由球，台面保留。`);
  }
  if (state.choice?.kind === 'break-eight' && option === 'as-is') {
    const next = cloneState(state);
    next.phase = 'aim';
    next.choice = null;
    next.isBreak = false;
    next.current = opponent;
    next.ballInHand = null;
    next.message = `${playerName(opponent)}按现在的母球位置继续。`;
    return next;
  }
  if (state.choice?.kind === 'break-eight' && option === 'kitchen') {
    const next = cloneState(state);
    const cue = next.balls.find(ball => ball.id === 0);
    if (cue) cue.pocketed = true;
    return handOver(next, opponent, `${playerName(opponent)}线后自由球。`, 'kitchen');
  }
  if (option === 'self' || option === 'again') {
    const next = createGame();
    const breaker = option === 'self' ? opponent : state.current;
    next.current = breaker;
    next.breaker = breaker;
    next.breakWarning = option === 'again';
    next.message = option === 'again'
      ? `${playerName(breaker)}再次开球。若仍不合法，本局判负。`
      : `${playerName(breaker)}重新开球。`;
    return next;
  }
  return state;
}

function playShot(state, shot) {
  if (state.phase !== 'aim') return { state, simulation: null };
  const cue = state.balls.find(ball => ball.id === 0);
  if (!cue || cue.pocketed) return { state, simulation: null };
  if (state.ballInHand === 'kitchen' && cue.x > KITCHEN_LINE) return { state, simulation: null };
  const active = state.balls.filter(ball => !ball.pocketed);
  const simulation = simulateShot(active, { shot, maxTime: 9, dt: 1 / 420, sampleDt: 1 / 60 });
  const present = new Map(simulation.balls.map(ball => [ball.id, ball]));
  const balls = state.balls.map(ball => present.get(ball.id) || cloneBall(ball));
  const resolved = resolveShot(state, { ...simulation, balls });
  return { state: resolved, simulation };
}

module.exports = {
  HEAD_SPOT,
  KITCHEN_LINE,
  NAMES,
  playerName,
  createGame,
  canPlace,
  placeCue,
  resolveShot,
  choose,
  playShot
};
