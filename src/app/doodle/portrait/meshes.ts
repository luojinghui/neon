import type { StickerId } from './settings';
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (v: V3): V3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const rgb = (hex: string): V3 => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as V3;

/** Original procedural meshes: real depth, normals and lighting, no downloaded stickers. */
export function buildSticker(id: StickerId, color: string): Float32Array {
  const vertices: number[] = [];
  const primary = rgb(color), cream = rgb('#fff1df'), pink = rgb('#f980ae'), ink = rgb('#42324d');
  const triangle = (a: V3, b: V3, c: V3, tone: V3) => {
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) vertices.push(...p, ...normal, ...tone);
  };
  const sphere = (center: V3, radius: V3, tone: V3) => {
    const point = (u: number, v: number) => {
      const unit: V3 = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
      return { p: unit.map((n, i) => center[i] + n * radius[i]) as V3, n: normalize(unit.map((n, i) => n / radius[i]) as V3) };
    };
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
      const a = point(x / 20 * Math.PI * 2, y / 12 * Math.PI), b = point((x + 1) / 20 * Math.PI * 2, y / 12 * Math.PI), c = point(x / 20 * Math.PI * 2, (y + 1) / 12 * Math.PI), d = point((x + 1) / 20 * Math.PI * 2, (y + 1) / 12 * Math.PI);
      for (const v of [a, b, c, b, d, c]) vertices.push(...v.p, ...v.n, ...tone);
    }
  };
  const cone = (x: number, y: number, z: number, radius: number, height: number, tone: V3, sides = 12) => {
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2;
      triangle([x + Math.cos(a) * radius, y, z + Math.sin(a) * radius], [x, y + height, z], [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius], tone);
    }
  };
  const ring = (center: V3, radius: number, tube: number, squash = 1) => {
    const point = (u: number, v: number): V3 => [center[0] + (radius + tube * Math.cos(v)) * Math.cos(u), center[1] + (radius + tube * Math.cos(v)) * Math.sin(u) * squash, center[2] + tube * Math.sin(v)];
    for (let a = 0; a < 40; a++) for (let b = 0; b < 8; b++) {
      const u = a * Math.PI / 20, v = b * Math.PI / 4;
      const p = point(u, v), q = point(u + Math.PI / 20, v), r = point(u, v + Math.PI / 4), s = point(u + Math.PI / 20, v + Math.PI / 4);
      triangle(p, q, r, cream); triangle(q, s, r, cream);
    }
  };
  if (id === 'cat') for (const x of [-0.68, 0.68]) {
    triangle([x - 0.28, 0.55, 0.04], [x, 1.22, 0], [x + 0.28, 0.55, 0.04], primary);
    triangle([x - 0.28, 0.55, 0.04], [x, 0.65, -0.3], [x, 1.22, 0], cream);
    triangle([x + 0.28, 0.55, 0.04], [x, 1.22, 0], [x, 0.65, -0.3], cream);
    triangle([x - 0.16, 0.63, 0.055], [x, 1.05, 0.035], [x + 0.16, 0.63, 0.055], pink);
    sphere([x, 0.57, 0.04], [0.29, 0.09, 0.16], primary);
  }
  if (id === 'bear') for (const x of [-0.75, 0.75]) {
    sphere([x, 0.68, 0], [0.32, 0.34, 0.2], primary);
    sphere([x, 0.68, 0.17], [0.2, 0.22, 0.08], cream);
  }
  if (id === 'rabbit') for (const x of [-0.52, 0.52]) {
    sphere([x, 1.02, 0], [0.24, 0.63, 0.18], cream);
    sphere([x, 1.05, 0.15], [0.12, 0.45, 0.05], primary);
  }
  if (id === 'alien') for (const x of [-0.6, 0.6]) {
    sphere([x, 0.83, 0], [0.065, 0.38, 0.065], primary);
    sphere([x, 1.2, 0], [0.24, 0.24, 0.24], primary);
    sphere([x, 1.2, 0.21], [0.12, 0.13, 0.06], cream);
    sphere([x, 1.2, 0.26], [0.055, 0.07, 0.025], ink);
  }
  if (id === 'crown') {
    sphere([0, 0.8, 0], [0.8, 0.13, 0.23], primary);
    for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
      cone(x, 0.8, 0, 0.18, 0.42 + (1 - Math.abs(x)) * 0.15, primary, 4);
      sphere([x, 1.22 + (1 - Math.abs(x)) * 0.15, 0], [0.08, 0.08, 0.08], cream);
    }
  }
  if (id === 'planet') {
    sphere([0, 1.05, 0], [0.36, 0.36, 0.36], primary);
    ring([0, 1.05, 0.15], 0.6, 0.05, 0.35);
    sphere([0.72, 1.38, 0.1], [0.1, 0.1, 0.1], pink);
  }
  return new Float32Array(vertices);
}
