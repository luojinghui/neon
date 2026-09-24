export type ImageTransform = { scale: number; x: number; y: number };
export type Point = { x: number; y: number };

export const INITIAL_TRANSFORM: ImageTransform = { scale: 1, x: 0, y: 0 };

export function constrainTransform(transform: ImageTransform, image: { width: number; height: number }, viewport: { width: number; height: number }): ImageTransform {
  const scale = Math.min(4, Math.max(1, transform.scale));
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { scale, x: maxX ? Math.min(maxX, Math.max(-maxX, transform.x)) : 0, y: maxY ? Math.min(maxY, Math.max(-maxY, transform.y)) : 0 };
}

export function pinchTransform(start: ImageTransform, anchor: Point, midpoint: Point, ratio: number): ImageTransform {
  const scale = Math.min(4, Math.max(1, start.scale * ratio));
  const change = scale / start.scale;
  return { scale, x: midpoint.x + (start.x - anchor.x) * change, y: midpoint.y + (start.y - anchor.y) * change };
}

export function swipeDirection(dx: number, dy: number, duration: number, width: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.25) return 0;
  const farEnough = Math.abs(dx) >= Math.min(100, width * 0.18);
  const fastEnough = Math.abs(dx) / Math.max(duration, 1) > 0.45;
  return farEnough || fastEnough ? (dx < 0 ? 1 : -1) : 0;
}
