import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { CANONICAL_FACE_XY, FACE_MESH_TRIANGLES, FACE_MESH_VERTEX_COUNT } from './face-sticker-mesh-data';
import type { StickerContentBounds } from './sticker-content-bounds';

let canonicalLeft = Infinity;
let canonicalRight = -Infinity;
let canonicalBottom = Infinity;
let canonicalTop = -Infinity;
for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
  canonicalLeft = Math.min(canonicalLeft, CANONICAL_FACE_XY[index * 2]);
  canonicalRight = Math.max(canonicalRight, CANONICAL_FACE_XY[index * 2]);
  canonicalBottom = Math.min(canonicalBottom, CANONICAL_FACE_XY[index * 2 + 1]);
  canonicalTop = Math.max(canonicalTop, CANONICAL_FACE_XY[index * 2 + 1]);
}
const canonicalWidth = canonicalRight - canonicalLeft;
const canonicalHeight = canonicalTop - canonicalBottom;
const canonicalAspect = canonicalWidth / canonicalHeight;
// 标准脸最高眉点 y≈5.11；从眉线上方开始补偿，眉眼、脸颊与下巴仍严格跟踪原关键点。
const foreheadStart = 5.21;
const foreheadWeights = new Float32Array(FACE_MESH_VERTEX_COUNT);
const foreheadHorizontal = new Float32Array(FACE_MESH_VERTEX_COUNT);
// 左侧额头外轮廓从中轴到太阳穴；右侧标准脸与它镜像对称。
const foreheadOutline = [10, 109, 67, 103, 54, 21, 162, 127];
for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
  const y = CANONICAL_FACE_XY[index * 2 + 1];
  const t = Math.max(0, Math.min(1, (y - foreheadStart) / (canonicalTop - foreheadStart)));
  foreheadWeights[index] = t * t * (3 - 2 * t);
  foreheadHorizontal[index] = 0.5;
  if (t === 0) continue;
  for (let edge = 1; edge < foreheadOutline.length; edge++) {
    const upper = foreheadOutline[edge - 1];
    const lower = foreheadOutline[edge];
    const upperY = CANONICAL_FACE_XY[upper * 2 + 1];
    const lowerY = CANONICAL_FACE_XY[lower * 2 + 1];
    if (y < lowerY || y > upperY) continue;
    const fraction = (upperY - y) / (upperY - lowerY);
    const left = CANONICAL_FACE_XY[upper * 2] * (1 - fraction) + CANONICAL_FACE_XY[lower * 2] * fraction;
    if (left < -0.0001)
      foreheadHorizontal[index] = Math.max(0, Math.min(1, 0.5 - CANONICAL_FACE_XY[index * 2] / (2 * left)));
    break;
  }
}
// 10→168 是额头至鼻梁的稳定方向，避开张嘴时移动的下巴；补偿量约为标准脸高的 10%。
const foreheadGain = (canonicalHeight * 0.1) / (CANONICAL_FACE_XY[10 * 2 + 1] - CANONICAL_FACE_XY[168 * 2 + 1]);

/** 眉线上下采用不同映射时，局部收敛冲突顶点，防止纹理三角形翻折；仅在素材初始化时运行。 */
function preserveUvTriangles(uv: Float32Array, original: Float32Array) {
  const conflicts = new Uint8Array(FACE_MESH_VERTEX_COUNT);
  const area = (coords: Float32Array, a: number, b: number, c: number) =>
    (coords[b * 2] - coords[a * 2]) * (coords[c * 2 + 1] - coords[a * 2 + 1]) -
    (coords[c * 2] - coords[a * 2]) * (coords[b * 2 + 1] - coords[a * 2 + 1]);
  for (let pass = 0; pass <= 12; pass++) {
    let hasConflict = false;
    conflicts.fill(0);
    for (let index = 0; index < FACE_MESH_TRIANGLES.length; index += 3) {
      const a = FACE_MESH_TRIANGLES[index];
      const b = FACE_MESH_TRIANGLES[index + 1];
      const c = FACE_MESH_TRIANGLES[index + 2];
      const before = area(original, a, b, c);
      if (Math.abs(before) < 1e-10 || Math.sign(before) * area(uv, a, b, c) >= Math.abs(before) * 0.05) continue;
      hasConflict = true;
      conflicts[a] = conflicts[b] = conflicts[c] = 1;
    }
    if (!hasConflict) return;
    if (pass === 12) {
      uv.set(original);
      return;
    }
    for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
      if (!conflicts[index]) continue;
      uv[index * 2] = (uv[index * 2] + original[index * 2]) * 0.5;
      // 优先收敛横向压缩，保持已移入可见主体的 v，避免额头重新采到顶部透明鱼鳍区域。
    }
  }
}

/**
 * 468 点表面贴图：每帧复用位置缓冲，静态 UV 与官方拓扑仅在素材初始化时准备。
 * UV 由 canonical 正面 x/y 投影得到，v=0 对应图片上边；普通图片无需制作人脸 UV atlas。
 * 官方拓扑封住眼口内部，需要露出真实眼口的素材应在对应区域保留透明像素。
 */
export class FaceStickerMeshGeometry {
  public readonly positions = new Float32Array(FACE_MESH_VERTEX_COUNT * 3);
  public readonly texCoords = new Float32Array(FACE_MESH_VERTEX_COUNT * 2);
  /** 全实例共享的只读拓扑；调用方上传即可，不应修改数组内容。 */
  public readonly indices = FACE_MESH_TRIANGLES;
  private readonly valid: boolean;

  /**
   * fill 拉伸可见内容铺满正面脸框；contain 保持可见内容比例居中，UV 可以越出图片边界。
   * 渲染器须丢弃 [0,1] 外的 UV，不能用 clamp-to-edge 把边缘像素延伸到未覆盖区域。
   */
  constructor(imageAspect: number, fit: 'fill' | 'contain', content: StickerContentBounds) {
    this.valid =
      Number.isFinite(imageAspect) &&
      imageAspect > 0 &&
      (fit === 'fill' || fit === 'contain') &&
      !!content &&
      Number.isFinite(content.left) &&
      Number.isFinite(content.right) &&
      Number.isFinite(content.top) &&
      Number.isFinite(content.bottom) &&
      content.left >= 0 &&
      content.right <= 1 &&
      content.top >= 0 &&
      content.bottom <= 1 &&
      content.right > content.left &&
      content.bottom > content.top;
    if (!this.valid) return;

    const contentWidth = content.right - content.left;
    const contentHeight = content.bottom - content.top;
    const visibleAspect = (imageAspect * contentWidth) / contentHeight;
    // inverseScale 将脸框坐标变换到等比居中的可见内容坐标，超出的部分自然产生越界 UV。
    const inverseScaleX = fit === 'contain' ? Math.max(1, canonicalAspect / visibleAspect) : 1;
    const inverseScaleY = fit === 'contain' ? Math.max(1, visibleAspect / canonicalAspect) : 1;
    const foreheadEndV = content.top + ((canonicalTop - foreheadStart) / canonicalHeight) * contentHeight;
    const originalTexCoords = fit === 'fill' && content.rowContour ? new Float32Array(this.texCoords.length) : null;
    if (
      !Number.isFinite(visibleAspect) ||
      visibleAspect <= 0 ||
      !Number.isFinite(inverseScaleX) ||
      !Number.isFinite(inverseScaleY)
    ) {
      this.valid = false;
      return;
    }
    for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
      const x = (CANONICAL_FACE_XY[index * 2] - canonicalLeft) / canonicalWidth;
      const y = (canonicalTop - CANONICAL_FACE_XY[index * 2 + 1]) / canonicalHeight;
      this.texCoords[index * 2] = content.left + (0.5 + (x - 0.5) * inverseScaleX) * contentWidth;
      this.texCoords[index * 2 + 1] = content.top + (0.5 + (y - 0.5) * inverseScaleY) * contentHeight;
      if (originalTexCoords) {
        originalTexCoords[index * 2] = this.texCoords[index * 2];
        originalTexCoords[index * 2 + 1] = this.texCoords[index * 2 + 1];
      }
      // 将眉上的可见主体轮廓映射到额头弧线，避免鱼鳍撑高 bbox 后两侧采到透明区域。
      // 横向也按该行可见宽度适配；只移动 v 会把额头拉出凸台。
      const contour = content.rowContour;
      const v = this.texCoords[index * 2 + 1];
      const visibleTop = content.bodyTop;
      if (
        fit === 'fill' &&
        contour &&
        contour.length >= 2 &&
        foreheadWeights[index] > 0 &&
        visibleTop !== undefined &&
        Number.isFinite(visibleTop) &&
        visibleTop > content.top &&
        visibleTop < foreheadEndV - contentHeight * 0.005
      ) {
        const t = (v - content.top) / (foreheadEndV - content.top);
        const targetV = visibleTop + t * (foreheadEndV - visibleTop);
        const rowCount = contour.length / 2;
        const row = Math.max(0, Math.min(rowCount - 1, targetV * rowCount - 0.5));
        const rowIndex = Math.floor(row);
        const next = Math.min(rowIndex + 1, rowCount - 1);
        // 取相邻行边界的交集，让线性纹理采样落在两行都有内容的区域。
        const left = Math.max(contour[rowIndex * 2], contour[next * 2]);
        const right = Math.min(contour[rowIndex * 2 + 1], contour[next * 2 + 1]);
        if (Number.isFinite(left) && Number.isFinite(right) && left < right) {
          const targetU = left + foreheadHorizontal[index] * (right - left);
          const blend = Math.min(1, (CANONICAL_FACE_XY[index * 2 + 1] - foreheadStart) / 0.5);
          this.texCoords[index * 2] += (targetU - this.texCoords[index * 2]) * blend;
          // v 采用单调映射，在眉线处自然回到原值；再乘 blend 会让临近眉线的纹理上下折返。
          this.texCoords[index * 2 + 1] = targetV;
        }
      }
      if (!Number.isFinite(this.texCoords[index * 2]) || !Number.isFinite(this.texCoords[index * 2 + 1])) {
        this.valid = false;
        return;
      }
    }
    if (originalTexCoords) preserveUvTriangles(this.texCoords, originalTexCoords);
  }

  /**
   * 将第一张脸投影到未镜像 clip 坐标，眉上沿局部额头方向延伸，不需要姿态矩阵。
   * z 使用有界单调映射：MediaPipe 越负越近，配合 LESS 深度测试形成同一张脸的自遮挡。
   * 这是单脸相对深度，不能据此比较不同人脸的绝对距离。返回 null 时保留上一份有效缓冲。
   */
  public update(result: FaceLandmarkerResult, width: number, height: number): Float32Array | null {
    const landmarks = result?.faceLandmarks?.[0];
    if (
      !this.valid ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      !landmarks ||
      landmarks.length < FACE_MESH_VERTEX_COUNT
    )
      return null;

    const forehead = landmarks[10];
    const bridge = landmarks[168];
    if (!forehead || !bridge) return null;
    const offsetX = forehead.x * foreheadGain - bridge.x * foreheadGain;
    const offsetY = forehead.y * foreheadGain - bridge.y * foreheadGain;
    const offsetZ = forehead.z * foreheadGain - bridge.z * foreheadGain;

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    // 先验证整帧再写入，避免坏点使调用方持有的上一帧缓冲只更新了一半。
    for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
      const point = landmarks[index];
      const weight = foreheadWeights[index];
      if (
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        !Number.isFinite(point.z) ||
        !Number.isFinite(Math.fround((point.x + offsetX * weight) * 2 - 1)) ||
        !Number.isFinite(Math.fround(1 - (point.y + offsetY * weight) * 2)) ||
        !Number.isFinite(point.z + offsetZ * weight)
      )
        return null;
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
    if ((right - left) * width < 1 || (bottom - top) * height < 1) return null;

    for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
      const point = landmarks[index];
      const weight = foreheadWeights[index];
      const z = point.z + offsetZ * weight;
      this.positions[index * 3] = (point.x + offsetX * weight) * 2 - 1;
      this.positions[index * 3 + 1] = 1 - (point.y + offsetY * weight) * 2;
      this.positions[index * 3 + 2] = (0.9 * z) / (1 + Math.abs(z));
    }
    return this.positions;
  }
}
