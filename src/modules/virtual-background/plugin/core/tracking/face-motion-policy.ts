import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// 避开嘴角、下巴、眼皮，防止说话把刚性运动判断长期抬到 30Hz。
const ANCHORS = [1, 4, 6, 10, 33, 168, 234, 263, 454];

/** 仅比较真实模型结果；输出区分可由帧间相似变换补偿的运动与必须刷新 mesh 的形变。 */
export function classifyFaceMotion(
  previous: FaceLandmarkerResult | null,
  next: FaceLandmarkerResult,
  elapsedMs: number,
  aspect: number
): 'rigid' | 'deformation' | undefined {
  const before = previous?.faceLandmarks[0];
  const after = next.faceLandmarks[0];
  if (!before || before.length < 468 || !after || after.length < 468 || elapsedMs <= 0) return;
  const distance = (points: typeof after, a: number, b: number) =>
    Math.hypot(points[a].x - points[b].x, (points[a].y - points[b].y) * aspect);
  const width = Math.max(distance(before, 234, 454), distance(after, 234, 454));
  if (!Number.isFinite(width) || width <= 0.02) return;

  // 眼口开合使用各自局部宽度归一化，整体平移、缩放、roll 不应被当成表情。
  for (const [top, bottom, left, right, threshold] of [
    [13, 14, 78, 308, 0.12],
    [159, 145, 33, 133, 0.1],
    [386, 374, 263, 362, 0.1]
  ]) {
    const a = distance(before, left, right);
    const b = distance(after, left, right);
    if (
      Math.min(a, b) > width * 0.08 &&
      Math.abs(distance(before, top, bottom) / a - distance(after, top, bottom) / b) > threshold
    ) {
      return 'deformation';
    }
  }

  const valid = ANCHORS.filter((i) => [before[i].x, before[i].y, after[i].x, after[i].y].every(Number.isFinite));
  if (valid.length < 6) return;
  const mean = (points: typeof after) => ({
    x: valid.reduce((sum, i) => sum + points[i].x, 0) / valid.length,
    y: valid.reduce((sum, i) => sum + points[i].y * aspect, 0) / valid.length
  });
  const p = mean(before);
  const q = mean(after);
  let denominator = 0;
  let dot = 0;
  let cross = 0;
  let moving = 0;
  let changed = 0;
  const threshold = Math.max(0.015, (elapsedMs / 1000) * 0.8) * width;
  for (const i of valid) {
    const x = before[i].x - p.x;
    const y = before[i].y * aspect - p.y;
    const u = after[i].x - q.x;
    const v = after[i].y * aspect - q.y;
    denominator += x * x + y * y;
    dot += x * u + y * v;
    cross += x * v - y * u;
    const displacement = Math.hypot(after[i].x - before[i].x, (after[i].y - before[i].y) * aspect);
    if (displacement > threshold) moving++;
    if (displacement > width * 0.015) changed++;
  }
  if (denominator <= 1e-8 || changed < 3) return;
  const a = dot / denominator;
  const b = cross / denominator;
  const residuals = valid
    .map((i) => {
      const x = before[i].x - p.x;
      const y = before[i].y * aspect - p.y;
      return Math.hypot(after[i].x - (q.x + a * x - b * y), after[i].y * aspect - (q.y + b * x + a * y));
    })
    .sort((x, y) => x - y);
  // 允许单个坏点，但多个锚点无法由同一变换解释时，需要密集推理追踪侧脸等形变。
  if (residuals[residuals.length - 3] / width > 0.025) return 'deformation';
  return moving >= 3 ? 'rigid' : undefined;
}
