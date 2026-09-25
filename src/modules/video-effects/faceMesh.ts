import geometry from './face-mesh.json';
import type { VideoEffectsSettings } from './types';

export const FACE_UV = new Float32Array(geometry.uv);
const EYES = [[33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382]];
const MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
// Close canonical eye/mouth holes with deformable surfaces, so the whole face is replaced.
const triangles = [...geometry.triangles];
for (const loop of [...EYES, MOUTH]) for (let i = 1; i < loop.length - 1; i++) triangles.push(loop[0], loop[i], loop[i + 1]);
export const FACE_TRIANGLES = new Uint16Array(triangles);

/** Artwork lives in canonical face coordinates; vertices move with all 468 facial points. */
export function createFaceTexture(style: VideoEffectsSettings['faceEffect']) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const point = (index: number) => [FACE_UV[index * 2] * 512, FACE_UV[index * 2 + 1] * 512];
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string, angle = 0) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill();
  };
  const path = (indices: number[], color: string, stroke?: string) => {
    ctx.beginPath(); indices.forEach((index, i) => { const [x, y] = point(index); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  const ink = '#292238';
  const base = style === 'avatar' ? '#c3b6f3' : style === 'fox' ? '#e99b56' : style === 'cat' ? '#d1b5ec' : '#f5eee3';
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#ffffff30'); gradient.addColorStop(1, '#27204820');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
  if (style === 'avatar') {
    ctx.fillStyle = '#373254'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(512, 0); ctx.lineTo(512, 164); ctx.lineTo(390, 98); ctx.lineTo(245, 140); ctx.lineTo(171, 98); ctx.lineTo(0, 166); ctx.fill();
    ellipse(256, 128, 12, 18, '#f7d98a');
  } else if (style === 'fox' || style === 'cat') {
    ellipse(140, 378, 143, 166, '#fff0dc', -.35); ellipse(372, 378, 143, 166, '#fff0dc', .35);
    if (style === 'cat') {
      for (const offset of [-1, 0, 1]) { ctx.fillStyle = '#7b639b'; ctx.beginPath(); ctx.moveTo(218 + offset * 47, 0); ctx.lineTo(247 + offset * 36, 125 + (offset === 0 ? 20 : 0)); ctx.lineTo(262 + offset * 40, 0); ctx.fill(); }
    }
  }
  for (const [index, eye] of EYES.entries()) {
    const [x1] = point(eye[0]), [x2] = point(eye[8]);
    const x = (x1 + x2) / 2, y = point(index ? 386 : 159)[1] + 13;
    if (style === 'panda') ellipse(x, y, Math.abs(x2 - x1) * .83, 59, ink, index ? .3 : -.3);
    path(eye, '#fff9ef', ink);
    ctx.save();
    ctx.beginPath(); eye.forEach((id, i) => { const [px, py] = point(id); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath(); ctx.clip();
    ellipse(x, y, 22, 31, style === 'avatar' ? '#54b7b7' : '#926445'); ellipse(x, y, 11, 24, ink); ellipse(x - 6, y - 11, 6, 8, '#fff');
    ctx.restore();
    const brow = index ? [336, 296, 334, 293, 300] : [70, 63, 105, 66, 107];
    ctx.beginPath(); brow.forEach((id, i) => { const [px, py] = point(id); if (i) ctx.lineTo(px, py - 3); else ctx.moveTo(px, py - 3); }); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = ink; ctx.stroke();
  }
  for (const id of [50, 280]) { const [x, y] = point(id); ellipse(x, y + 18, 32, 17, style === 'panda' ? '#eaaeb0' : '#df939880'); }
  const [nx, ny] = point(1);
  ellipse(nx, ny - 4, style === 'avatar' ? 12 : 27, style === 'avatar' ? 7 : 17, style === 'cat' ? '#bd6f91' : ink);
  path([61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91], '#be728c');
  path(MOUTH, '#482536');
  const [, mouthY] = point(13);
  ctx.fillStyle = '#fff9ef'; ctx.fillRect(230, mouthY, 52, 6);
  if (style === 'cat' || style === 'fox') {
    ctx.strokeStyle = '#6b5064'; ctx.lineWidth = 3;
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(nx + side * 48, ny + 12 + i * 13); ctx.lineTo(nx + side * 125, ny - 7 + i * 26); ctx.stroke();
    }
  }
  return canvas;
}

/** Bounded prediction removes tracking lag without a long temporal smoothing buffer. */
export class FaceTracker {
  private previous: Float32Array = new Float32Array(0);
  private current: Float32Array = new Float32Array(0);
  private output = new Float32Array(0);
  private time = -Infinity;
  private previousTime = -Infinity;

  update(face: Float32Array, timestamp: number) {
    if (timestamp <= this.time) return;
    this.previous = this.current; this.previousTime = this.time;
    this.current = face; this.time = timestamp;
    if (this.output.length !== face.length) this.output = new Float32Array(face.length);
  }
  sample(now: number) {
    if (now - this.time > 250) return this.output.subarray(0, 0);
    const dt = this.time - this.previousTime;
    const predict = this.previous.length === this.current.length && dt > 0 && dt < 180 ? Math.min(30, Math.max(0, now - this.time)) / dt : 0;
    for (let i = 0; i < this.current.length; i++) this.output[i] = this.current[i] + Math.max(-.018, Math.min(.018, (this.current[i] - (this.previous[i] ?? this.current[i])) * predict));
    return this.output;
  }
}
