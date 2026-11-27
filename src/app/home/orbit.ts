export interface OrbitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OrbitPoint {
  x: number;
  y: number;
}

export interface OrbitTether {
  d: string;
  anchor: OrbitPoint;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 从卡片中心朝目标射出，落在卡片边框上。 */
export function cardEdgeToward(card: OrbitBox, target: OrbitPoint): OrbitPoint {
  const cx = card.x + card.w / 2;
  const cy = card.y + card.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: round(cx), y: round(cy) };
  const scaleX = dx !== 0 ? (card.w / 2) / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? (card.h / 2) / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: round(cx + dx * scale), y: round(cy + dy * scale) };
}

function shiftToward(from: OrbitPoint, to: OrbitPoint, distance: number): OrbitPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const travel = Math.min(Math.max(distance, 0), length * 0.42);
  return { x: from.x + (dx / length) * travel, y: from.y + (dy / length) * travel };
}

/**
 * 引力线从星球外侧弯到卡片靠近星球的那一边。
 * planetGap 让线从星球图形外面出发，而不是从圆心底下钻出来。
 */
export function buildTether(planet: OrbitPoint, card: OrbitBox, planetGap = 46): OrbitTether | null {
  if (card.w <= 0 || card.h <= 0) return null;
  const edge = cardEdgeToward(card, planet);
  const start = shiftToward(planet, edge, planetGap);
  const dx = edge.x - start.x;
  const dy = edge.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(28, length * 0.16);
  const control = {
    x: round((start.x + edge.x) / 2 + (-dy / length) * bend),
    y: round((start.y + edge.y) / 2 + (dx / length) * bend)
  };
  return {
    anchor: edge,
    d: `M ${round(start.x)} ${round(start.y)} Q ${control.x} ${control.y} ${edge.x} ${edge.y}`
  };
}
