import type { IFaceStickerPlacement } from '../../../type';
import { CANONICAL_FACE_XY, FACE_MESH_VERTEX_COUNT } from './face-sticker-mesh-data';

/** 可见内容在原图中的归一化边界（0～1）；右、下边界为可见区域的外缘。 */
export interface StickerContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** 每行首尾不透明像素中心的归一化横坐标，按 left/right 成对排列；空行的两个值均为 NaN。 */
  rowContour?: Float32Array;
  /** 首个不透明像素数达到可见边界宽度 40% 且覆盖边界中轴的行中心，纵坐标归一化至 0～1。 */
  bodyTop?: number;
}

export const FULL_STICKER_CONTENT: StickerContentBounds = { left: 0, top: 0, right: 1, bottom: 1 };

interface StickerContentAnalysis {
  bounds: StickerContentBounds;
  opaqueCoverage?: number;
}

const analysisCache = new WeakMap<HTMLImageElement, Map<boolean, StickerContentAnalysis>>();
let canonicalLeft = Infinity;
let canonicalRight = -Infinity;
let canonicalTop = -Infinity;
let canonicalBottom = Infinity;
for (let index = 0; index < FACE_MESH_VERTEX_COUNT; index++) {
  canonicalLeft = Math.min(canonicalLeft, CANONICAL_FACE_XY[index * 2]);
  canonicalRight = Math.max(canonicalRight, CANONICAL_FACE_XY[index * 2]);
  canonicalTop = Math.max(canonicalTop, CANONICAL_FACE_XY[index * 2 + 1]);
  canonicalBottom = Math.min(canonicalBottom, CANONICAL_FACE_XY[index * 2 + 1]);
}
const canonicalFaceAspect = (canonicalRight - canonicalLeft) / (canonicalTop - canonicalBottom);

/**
 * 估算图片的可见内容边界，使下巴约束忽略透明 padding，而不修改原图像素。
 * 最长边缩至不超过 256 像素后扫描 alpha ≥ 16 的区域；调用方应按素材缓存结果，避免逐帧读取。
 *
 * @param { HTMLImageElement } source - 已加载的贴纸原图。
 * @param { boolean } includeForeheadProfile - 是否在同一次扫描中记录 alpha ≥ 128 的行轮廓及主体顶部，默认关闭。
 * @returns { StickerContentBounds } - 归一化可见边界；全透明、画布不可用或像素读取失败时退回整图边界。
 */
export function getStickerContentBounds(source: HTMLImageElement, includeForeheadProfile = false): StickerContentBounds {
  return analyzeStickerContent(source, includeForeheadProfile).bounds;
}

/**
 * 估算贴纸实际覆盖标准脸的面积比例，仅在素材准备时扫描一次最多 256px 的 alpha 缩图。
 * 网格贴纸按标准脸映射；平面贴纸仅当锚点为 face 时参与覆盖判断，眼镜等局部装饰不会暂停美白。
 */
export function estimateFaceStickerCoverage(
  source: HTMLImageElement,
  fit: 'fill' | 'contain',
  placement: IFaceStickerPlacement = {}
): number | undefined {
  const mesh = placement.mode === 'mesh';
  const analysis = analyzeStickerContent(source, mesh);
  if (analysis.opaqueCoverage === undefined) return;
  const bounds = analysis.bounds;
  const contentWidth = bounds.right - bounds.left;
  const contentHeight = bounds.bottom - bounds.top;
  const imageAspect = source.naturalWidth / source.naturalHeight;
  const visibleAspect = (imageAspect * contentWidth) / contentHeight;
  if (![contentWidth, contentHeight, imageAspect, visibleAspect].every(Number.isFinite) || visibleAspect <= 0) return;
  if (mesh) {
    const containScale =
      fit === 'contain' ? Math.min(canonicalFaceAspect / visibleAspect, visibleAspect / canonicalFaceAspect) : 1;
    return Math.max(0, Math.min(1, analysis.opaqueCoverage * containScale));
  }
  if ((placement.anchor ?? 'face') !== 'face') return 0;
  const scale = placement.scale ?? 1.25;
  if (!Number.isFinite(scale) || scale <= 0) return;
  const offset = placement.offset ?? [0, 0, 0];
  if (offset.length !== 3 || !offset.every(Number.isFinite)) return;
  const contentLeft = offset[0] + (bounds.left - 0.5) * scale;
  const contentRight = offset[0] + (bounds.right - 0.5) * scale;
  const contentTop = offset[1] + (0.5 - bounds.top) * (scale / imageAspect);
  const contentBottom = offset[1] + (0.5 - bounds.bottom) * (scale / imageAspect);
  const faceHalfHeight = 0.5 / canonicalFaceAspect;
  const overlapWidth = Math.max(0, Math.min(0.5, contentRight) - Math.max(-0.5, contentLeft));
  const overlapHeight = Math.max(0, Math.min(faceHalfHeight, contentTop) - Math.max(-faceHalfHeight, contentBottom));
  const faceArea = 1 / canonicalFaceAspect;
  return Math.max(0, Math.min(1, (analysis.opaqueCoverage * overlapWidth * overlapHeight) / faceArea));
}

function analyzeStickerContent(source: HTMLImageElement, includeForeheadProfile: boolean): StickerContentAnalysis {
  const cached = analysisCache.get(source)?.get(includeForeheadProfile);
  if (cached) return cached;
  const scale = Math.min(1, 256 / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  let analysis: StickerContentAnalysis;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      analysis = { bounds: FULL_STICKER_CONTENT };
      cacheAnalysis(source, includeForeheadProfile, analysis);
      return analysis;
    }
    context.drawImage(source, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const rowContour = includeForeheadProfile ? new Float32Array(height * 2).fill(Number.NaN) : undefined;
    const opaqueCounts = includeForeheadProfile ? new Uint16Array(height) : undefined;
    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;
    let opaqueCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        // 极淡的抗锯齿/阴影像素不作为可见下沿。
        if (alpha < 16) continue;
        if (rowContour && opaqueCounts && alpha >= 128) {
          if (Number.isNaN(rowContour[y * 2])) rowContour[y * 2] = (x + 0.5) / width;
          rowContour[y * 2 + 1] = (x + 0.5) / width;
          opaqueCounts[y]++;
        }
        if (alpha >= 128) opaqueCount++;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) {
      analysis = { bounds: FULL_STICKER_CONTENT };
      cacheAnalysis(source, includeForeheadProfile, analysis);
      return analysis;
    }
    const bounds: StickerContentBounds = {
      left: left / width,
      top: top / height,
      right: right / width,
      bottom: bottom / height
    };
    if (rowContour && opaqueCounts) {
      bounds.rowContour = rowContour;
      const centerX = Math.floor((left + right) / 2);
      const minOpaqueCount = (right - left) * 0.4;
      for (let y = top; y < bottom; y++) {
        if (opaqueCounts[y] >= minOpaqueCount && data[(y * width + centerX) * 4 + 3] >= 128) {
          bounds.bodyTop = (y + 0.5) / height;
          break;
        }
      }
    }
    analysis = {
      bounds,
      opaqueCoverage: Math.max(0, Math.min(1, opaqueCount / ((right - left) * (bottom - top))))
    };
  } catch {
    // 无法读取像素时仍保留贴纸，退回完整图片边界。
    analysis = { bounds: FULL_STICKER_CONTENT };
  }
  cacheAnalysis(source, includeForeheadProfile, analysis);
  return analysis;
}

function cacheAnalysis(source: HTMLImageElement, includeForeheadProfile: boolean, analysis: StickerContentAnalysis) {
  let cache = analysisCache.get(source);
  if (!cache) {
    cache = new Map<boolean, StickerContentAnalysis>();
    analysisCache.set(source, cache);
  }
  cache.set(includeForeheadProfile, analysis);
}
