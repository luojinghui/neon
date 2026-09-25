/** Fit the whole photo and accessory into the output, leaving a little headroom. */
export function fitPortraitFrame(points: Iterable<readonly [number, number]>) {
  let left = -1, right = 1, bottom = -1, top = 1;
  for (const [x, y] of points) {
    left = Math.min(left, x); right = Math.max(right, x);
    bottom = Math.min(bottom, y); top = Math.max(top, y);
  }
  const zoom = Math.min(1, 1.88 / (right - left), 1.88 / (top - bottom));
  return { zoom, offset: [-(left + right) * zoom / 2, -(top + bottom) * zoom / 2] as const };
}
