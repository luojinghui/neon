import type { IslandStroke, IslandStrokeBBox, IslandStrokeTool } from '../../core/types';

export type DoodleMode = 'select' | 'pen' | 'highlighter' | 'eraser';

export interface DoodleBrushConfig {
  mode: DoodleMode;
  color: string;
  sizeKey: 'sm' | 'md' | 'lg';
}

/** Content-data palette: 8 stationery ink colors independent of UI skin. */
export const DOODLE_COLORS: { color: string; label: string }[] = [
  { color: '#2C2520', label: '炭墨黑' },
  { color: '#E05A47', label: '珊瑚红' },
  { color: '#E88B2D', label: '暖橘橙' },
  { color: '#2E9E6B', label: '松叶绿' },
  { color: '#2B7DE9', label: '晴空蓝' },
  { color: '#7C5CE0', label: '鸢尾紫' },
  { color: '#D94D8C', label: '蔷薇粉' },
  { color: '#F7F3EA', label: '象牙白' }
];

export const DOODLE_SIZES: Record<'sm' | 'md' | 'lg', { pen: number; highlighter: number; label: string }> = {
  sm: { pen: 3, highlighter: 12, label: '细' },
  md: { pen: 6, highlighter: 18, label: '中' },
  lg: { pen: 12, highlighter: 28, label: '粗' }
};

export function resolveBrushStrokeSpec(config: DoodleBrushConfig): {
  tool: IslandStrokeTool;
  color: string;
  size: number;
  opacity: number;
} {
  const tool: IslandStrokeTool = config.mode === 'highlighter' ? 'highlighter' : 'pen';
  const preset = DOODLE_SIZES[config.sizeKey] || DOODLE_SIZES.md;
  return {
    tool,
    color: config.color,
    size: tool === 'highlighter' ? preset.highlighter : preset.pen,
    opacity: tool === 'highlighter' ? 0.35 : 1
  };
}

function perpendicularDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + clamped * dx), py - (y1 + clamped * dy));
}

function rdpIndices(pts: number[], start: number, end: number, tol: number, keep: Uint8Array): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let maxIndex = start;
  const x1 = pts[start * 2];
  const y1 = pts[start * 2 + 1];
  const x2 = pts[end * 2];
  const y2 = pts[end * 2 + 1];

  for (let i = start + 1; i < end; i += 1) {
    const d = perpendicularDistance(pts[i * 2], pts[i * 2 + 1], x1, y1, x2, y2);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > tol) {
    keep[maxIndex] = 1;
    rdpIndices(pts, start, maxIndex, tol, keep);
    rdpIndices(pts, maxIndex, end, tol, keep);
  }
}

/** Simplify a flat [x1, y1, x2, y2, ...] polyline with Ramer-Douglas-Peucker. */
export function simplifyPoints(points: number[], tolerance = 1.2, maxPairs = 300): number[] {
  const count = Math.floor(points.length / 2);
  if (count <= 2) {
    return points.slice(0, count * 2).map((n) => Math.round(n * 10) / 10);
  }

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  rdpIndices(points, 0, count - 1, tolerance, keep);

  const simplified: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) {
      simplified.push(
        Math.round(points[i * 2] * 10) / 10,
        Math.round(points[i * 2 + 1] * 10) / 10
      );
    }
  }

  const pairCount = simplified.length / 2;
  if (pairCount <= maxPairs) return simplified;

  const resampled: number[] = [];
  const step = (pairCount - 1) / (maxPairs - 1);
  for (let i = 0; i < maxPairs; i += 1) {
    const idx = i === maxPairs - 1 ? pairCount - 1 : Math.round(i * step);
    resampled.push(simplified[idx * 2], simplified[idx * 2 + 1]);
  }
  return resampled;
}

export function computeBBox(points: number[]): IslandStrokeBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Convert flat [x1, y1, ...] world points into a smooth SVG quadratic path. */
export function pointsToSvgPath(points: number[]): string {
  const count = Math.floor(points.length / 2);
  if (count === 0) return '';
  const x0 = points[0];
  const y0 = points[1];
  if (count === 1) {
    return `M ${x0} ${y0} L ${x0 + 0.1} ${y0}`;
  }
  if (count === 2) {
    const x1 = points[2];
    const y1 = points[3];
    if (x0 === x1 && y0 === y1) {
      return `M ${x0} ${y0} L ${x0 + 0.1} ${y0}`;
    }
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }

  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < count - 1; i += 1) {
    const cx = points[i * 2];
    const cy = points[i * 2 + 1];
    const nx = points[(i + 1) * 2];
    const ny = points[(i + 1) * 2 + 1];
    const mx = Math.round(((cx + nx) / 2) * 10) / 10;
    const my = Math.round(((cy + ny) / 2) * 10) / 10;
    d += ` Q ${cx} ${cy} ${mx} ${my}`;
  }
  const lastX = points[(count - 1) * 2];
  const lastY = points[(count - 1) * 2 + 1];
  d += ` L ${lastX} ${lastY}`;
  return d;
}

/** Hit-test whether world point (x, y) is within `radius` of a stroke. */
export function hitTestStroke(stroke: IslandStroke, x: number, y: number, radius: number): boolean {
  const pad = radius + stroke.size / 2;
  const { bbox, points } = stroke;
  if (
    x < bbox.minX - pad ||
    x > bbox.maxX + pad ||
    y < bbox.minY - pad ||
    y > bbox.maxY + pad
  ) {
    return false;
  }

  const count = Math.floor(points.length / 2);
  if (count === 0) return false;
  if (count === 1) {
    return Math.hypot(x - points[0], y - points[1]) <= pad;
  }
  for (let i = 0; i < count - 1; i += 1) {
    const d = perpendicularDistance(
      x,
      y,
      points[i * 2],
      points[i * 2 + 1],
      points[(i + 1) * 2],
      points[(i + 1) * 2 + 1]
    );
    if (d <= pad) return true;
  }
  return false;
}

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): WorldRect {
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2)
  };
}

/** Check whether a stroke's bounding box or points intersect a world-space marquee rectangle. */
export function strokeIntersectsRect(stroke: IslandStroke, rect: WorldRect): boolean {
  const pad = stroke.size / 2;
  const b = stroke.bbox;
  if (
    b.maxX + pad < rect.minX ||
    b.minX - pad > rect.maxX ||
    b.maxY + pad < rect.minY ||
    b.minY - pad > rect.maxY
  ) {
    return false;
  }
  const { points } = stroke;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const px = points[i];
    const py = points[i + 1];
    if (
      px >= rect.minX - pad &&
      px <= rect.maxX + pad &&
      py >= rect.minY - pad &&
      py <= rect.maxY + pad
    ) {
      return true;
    }
  }
  // Fallback: if stroke crosses completely through the marquee rect without a vertex inside
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  const radius = Math.hypot(rect.maxX - rect.minX, rect.maxY - rect.minY) / 2;
  return hitTestStroke(stroke, cx, cy, radius);
}

/** Compute the padded world bounding box enclosing all given strokes. */
export function computeCombinedBBox(strokes: IslandStroke[]): WorldRect | null {
  if (strokes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    const pad = Math.max(4, s.size / 2);
    if (s.bbox.minX - pad < minX) minX = s.bbox.minX - pad;
    if (s.bbox.minY - pad < minY) minY = s.bbox.minY - pad;
    if (s.bbox.maxX + pad > maxX) maxX = s.bbox.maxX + pad;
    if (s.bbox.maxY + pad > maxY) maxY = s.bbox.maxY + pad;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function translatePoints(points: number[], dx: number, dy: number): number[] {
  const next = new Array<number>(points.length);
  for (let i = 0; i + 1 < points.length; i += 2) {
    next[i] = Math.round((points[i] + dx) * 10) / 10;
    next[i + 1] = Math.round((points[i + 1] + dy) * 10) / 10;
  }
  return next;
}

export function scalePointsFromOrigin(
  points: number[],
  originX: number,
  originY: number,
  scaleX: number,
  scaleY: number
): number[] {
  const next = new Array<number>(points.length);
  for (let i = 0; i + 1 < points.length; i += 2) {
    next[i] = Math.round((originX + (points[i] - originX) * scaleX) * 10) / 10;
    next[i + 1] = Math.round((originY + (points[i + 1] - originY) * scaleY) * 10) / 10;
  }
  return next;
}
