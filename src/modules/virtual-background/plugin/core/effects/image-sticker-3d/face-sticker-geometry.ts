import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { IFaceStickerPlacement } from '../../../type';
import { FULL_STICKER_CONTENT, type StickerContentBounds } from './sticker-content-bounds';

/**
 * 根据首张人脸的关键点和姿态，将等比图片平面投影为保留透视关系的四个顶点。
 * 下巴约束只沿脸部向上平移超出的可见下沿，不拉伸图片或改变其宽高比。
 *
 * @param { FaceLandmarkerResult } result - 包含人脸关键点和 4 × 4 姿态矩阵的推理结果。
 * @param { number } width - 未镜像视频帧宽度，单位像素，必须为有限正数。
 * @param { number } height - 未镜像视频帧高度，单位像素，必须为有限正数。
 * @param { number } imageAspect - 原图宽高比（宽 / 高），必须为有限正数。
 * @param { IFaceStickerPlacement } placement - 锚点、相对脸宽的缩放与局部偏移，以及可选下巴约束。
 * @param { StickerContentBounds } content - 可见内容的归一化边界，仅用于下巴约束，默认整张图片。
 * @returns { Float32Array | null } - 三角形条带顶点，每点为 [clipX, clipY, w, u, v]；数据无效或投影不可用时为 null。
 */
export function createFaceStickerVertices(
  result: FaceLandmarkerResult,
  width: number,
  height: number,
  imageAspect: number,
  placement: IFaceStickerPlacement = {},
  content: StickerContentBounds = FULL_STICKER_CONTENT
): Float32Array | null {
  const landmarks = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes[0];
  if (!landmarks || matrix?.rows !== 4 || matrix.columns !== 4 || matrix.data.length !== 16) return null;
  if (![width, height, imageAspect].every((value) => Number.isFinite(value) && value > 0)) return null;
  if (!matrix.data.every(Number.isFinite)) return null;

  const valid = (point?: NormalizedLandmark): point is NormalizedLandmark =>
    !!point && [point.x, point.y, point.z].every(Number.isFinite);
  const left = landmarks[234];
  const right = landmarks[454];
  const anchorIndices = { face: [10, 152], eyes: [33, 263], forehead: [10, 10], nose: [1, 1] };
  const [first, second] = anchorIndices[placement.anchor ?? 'face'];
  const start = landmarks[first];
  const end = landmarks[second];
  if (![left, right, start, end].every(valid)) return null;

  // MediaPipe 的 z 与 x 使用同一归一化尺度，加入深度避免侧脸时二次压缩贴纸宽度。
  const faceWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height, (right.z - left.z) * width);
  if (faceWidth < 1) return null;

  const scale = placement.scale ?? 1.25;
  const offset = placement.offset ?? [0, 0, 0];
  if (!Number.isFinite(scale) || scale <= 0 || offset.length !== 3 || !offset.every(Number.isFinite)) return null;
  const halfWidth = (faceWidth * scale) / 2;
  const halfHeight = halfWidth / imageAspect;
  const centerX = ((start.x + end.x) / 2 - 0.5) * width;
  const centerY = (0.5 - (start.y + end.y) / 2) * height;
  const focalLength = height / (2 * Math.tan((63 * Math.PI) / 360));

  // MediaPipe 输出列主序、右手系矩阵（y 向上，z 朝摄像头）。仅提取旋转；
  // 平移和缩放由当前帧关键点确定，避免依赖摄像头内参或素材的厘米尺寸。
  const m = matrix.data;
  const axes = [0, 4, 8].map((index) => {
    const length = Math.hypot(m[index], m[index + 1], m[index + 2]);
    return length > 0 ? [m[index] / length, m[index + 1] / length, m[index + 2] / length] : null;
  });
  if (axes.some((axis) => !axis)) return null;
  const [xAxis, yAxis, zAxis] = axes as number[][];
  /**
   * 将图片 UV 投影到以帧中心为原点、y 向上的屏幕像素坐标。
   * @param { number } u - 图片水平方向归一化坐标，0 为左边缘，1 为右边缘。
   * @param { number } v - 图片垂直方向归一化坐标，0 为上边缘，1 为下边缘。
   * @returns 投影位置及透视除数 w；顶点过于接近或越过投影平面时为 null。
   */
  const project = (u: number, v: number) => {
    const x = (u * 2 - 1) * halfWidth + offset[0] * faceWidth;
    const y = (1 - v * 2) * halfHeight + offset[1] * faceWidth;
    const z = offset[2] * faceWidth;
    const rotated = [0, 1, 2].map((i) => xAxis[i] * x + yAxis[i] * y + zAxis[i] * z);
    const w = 1 - rotated[2] / focalLength;
    if (w <= 0.05) return null;
    return { x: centerX + rotated[0] / w, y: centerY + rotated[1] / w, w };
  };

  let correctionX = 0;
  let correctionY = 0;
  if (placement.constrainToChin && (placement.anchor ?? 'face') === 'face') {
    const chin = landmarks[152];
    const bottom = project((content.left + content.right) / 2, content.bottom);
    const axisLength = Math.hypot(yAxis[0], yAxis[1]);
    if (!valid(chin) || !bottom) return null;
    if (axisLength > 0.05) {
      const upX = yAxis[0] / axisLength;
      const upY = yAxis[1] / axisLength;
      // 只修正超过下巴的部分，保留 2% 脸宽的覆盖余量；不拉伸图片，也不把已上移的面具拉回下方。
      const overflow = Math.max(
        0,
        ((chin.x - 0.5) * width - bottom.x) * upX + ((0.5 - chin.y) * height - bottom.y) * upY - faceWidth * 0.02
      );
      correctionX = overflow * upX;
      correctionY = overflow * upY;
    }
  }

  const vertices: number[] = [];
  for (const [u, v] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1]
  ]) {
    const point = project(u, v);
    if (!point) return null;
    // 人脸锚点已是屏幕坐标，不能再随顶点深度做透视除法，否则离开画面中心会产生下沿漂移。
    vertices.push(
      (2 * (point.x + correctionX) * point.w) / width,
      (2 * (point.y + correctionY) * point.w) / height,
      point.w,
      u,
      v
    );
  }

  return vertices.every(Number.isFinite) ? new Float32Array(vertices) : null;
}
