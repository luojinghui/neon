import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FaceMotionImageReader, FrameContext } from '../types';

const MAX_DIMENSION = 192;
const PATCH_RADIUS = 3;
const SEARCH_RADIUS = 6;
const MIN_ANCHORS = 6;
const MAX_AGE_MS = 100;
const STABLE_POINTS = [10, 109, 338, 70, 300, 50, 101, 123, 205, 280, 330, 352, 425, 168, 6, 4];
const EXPRESSION_REGIONS = [
  [33, 133, 159, 145],
  [263, 362, 386, 374],
  [61, 291, 13, 14]
];

type Point = { x: number; y: number };
type Similarity = { a: number; b: number; x: number; y: number };
type GrayImage = { data: Uint8Array; width: number; height: number };
type Crop = { x: number; y: number; width: number; height: number };
type Anchor = Point & { patch: Float32Array; energy: number };
type Match = { from: Anchor; to: Point; error: number };
type Region = { points: Point[]; values: Float32Array; energy: number };

export interface FaceMotionResult {
  landmarks: FaceLandmarkerResult | null;
  /** 只表示二维刚性跟踪可信度，不能作为表情或三维姿态置信度。 */
  confidence: number;
  reason?: string;
}

function sample(image: GrayImage, x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const dx = x - ix;
  const dy = y - iy;
  const offset = iy * image.width + ix;
  return (
    (image.data[offset] * (1 - dx) + image.data[offset + 1] * dx) * (1 - dy) +
    (image.data[offset + image.width] * (1 - dx) + image.data[offset + image.width + 1] * dx) * dy
  );
}

function inside(image: GrayImage, x: number, y: number, margin = 0) {
  return x >= margin && y >= margin && x < image.width - 1 - margin && y < image.height - 1 - margin;
}

function apply(transform: Similarity, point: Point): Point {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.x,
    y: transform.b * point.x + transform.a * point.y + transform.y
  };
}

/** 去均值后匹配，允许整体曝光偏移；不能仅靠纹理方差接受一条无法定位的直边。 */
function patchAt(image: GrayImage, x: number, y: number): Anchor | null {
  if (!inside(image, x, y, PATCH_RADIUS + 1)) return null;
  const patch = new Float32Array((PATCH_RADIUS * 2 + 1) ** 2);
  let sum = 0;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let i = 0;
  for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
    for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
      const value = sample(image, x + dx, y + dy);
      patch[i++] = value;
      sum += value;
      const gx = sample(image, x + dx + 1, y + dy) - sample(image, x + dx - 1, y + dy);
      const gy = sample(image, x + dx, y + dy + 1) - sample(image, x + dx, y + dy - 1);
      xx += gx * gx;
      xy += gx * gy;
      yy += gy * gy;
    }
  }
  const mean = sum / patch.length;
  let energy = 0;
  for (let index = 0; index < patch.length; index++) {
    patch[index] -= mean;
    energy += patch[index] ** 2;
  }
  const corner = (xx + yy - Math.hypot(xx - yy, 2 * xy)) / (2 * patch.length);
  return energy / patch.length >= 25 && corner >= 4 ? { x, y, patch, energy } : null;
}

function patchError(image: GrayImage, anchor: Anchor, x: number, y: number) {
  if (!inside(image, x, y, PATCH_RADIUS)) return Infinity;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let sum = 0;
  let squares = 0;
  let product = 0;
  let i = 0;
  for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy++) {
    let offset = (iy + dy) * image.width + ix - PATCH_RADIUS;
    for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx++) {
      // 整数候选共享相同的小数位，避免每个像素重复 floor 和坐标拆解。
      const value =
        (image.data[offset] * (1 - fx) + image.data[offset + 1] * fx) * (1 - fy) +
        (image.data[offset + image.width] * (1 - fx) + image.data[offset + image.width + 1] * fx) * fy;
      sum += value;
      squares += value * value;
      product += anchor.patch[i++] * value;
      offset++;
    }
  }
  const energy = squares - (sum * sum) / anchor.patch.length;
  if (energy < 25 * anchor.patch.length) return Infinity;
  return Math.max(0, 1 - product / Math.sqrt(anchor.energy * energy));
}

function matchAnchor(image: GrayImage, anchor: Anchor, errors: Float32Array): Match | null {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  // 一次搜索记录候选，避免为每个候选分配 patch 或重复搜索唯一性。
  let index = 0;
  for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
      const error = patchError(image, anchor, anchor.x + dx, anchor.y + dy);
      errors[index++] = error;
      if (error < best) {
        best = error;
        bx = dx;
        by = dy;
      }
    }
  }
  if (best > 0.16 || Math.abs(bx) === SEARCH_RADIUS || Math.abs(by) === SEARCH_RADIUS) return null;
  let second = Infinity;
  index = 0;
  for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
      if (Math.abs(dx - bx) > 1 || Math.abs(dy - by) > 1) second = Math.min(second, errors[index]);
      index++;
    }
  }
  if (second - best < 0.025) return null;
  const x = anchor.x + bx;
  const y = anchor.y + by;
  const refine = (low: number, high: number) => {
    const curvature = low + high - 2 * best;
    return curvature > 0.00001 ? Math.max(-0.5, Math.min(0.5, (low - high) / (2 * curvature))) : 0;
  };
  return {
    from: anchor,
    to: {
      x: x + refine(patchError(image, anchor, x - 1, y), patchError(image, anchor, x + 1, y)),
      y: y + refine(patchError(image, anchor, x, y - 1), patchError(image, anchor, x, y + 1))
    },
    error: best
  };
}

function fit(matches: Match[]): Similarity | null {
  let fx = 0;
  let fy = 0;
  let tx = 0;
  let ty = 0;
  for (const match of matches) {
    fx += match.from.x;
    fy += match.from.y;
    tx += match.to.x;
    ty += match.to.y;
  }
  fx /= matches.length;
  fy /= matches.length;
  tx /= matches.length;
  ty /= matches.length;
  let denominator = 0;
  let a = 0;
  let b = 0;
  for (const match of matches) {
    const x = match.from.x - fx;
    const y = match.from.y - fy;
    const u = match.to.x - tx;
    const v = match.to.y - ty;
    denominator += x * x + y * y;
    a += x * u + y * v;
    b += x * v - y * u;
  }
  if (denominator < 16) return null;
  a /= denominator;
  b /= denominator;
  return { a, b, x: tx - a * fx + b * fy, y: ty - b * fx - a * fy };
}

function residual(transform: Similarity, match: Match) {
  const point = apply(transform, match.from);
  return Math.hypot(point.x - match.to.x, point.y - match.to.y);
}

function robustFit(matches: Match[]) {
  let inliers: Match[] = [];
  let bestError = Infinity;
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const transform = fit([matches[i], matches[j]]);
      if (!transform) continue;
      const selected = matches.filter((match) => residual(transform, match) < 0.8);
      const error = selected.reduce((total, match) => total + residual(transform, match), 0);
      if (selected.length > inliers.length || (selected.length === inliers.length && error < bestError)) {
        inliers = selected;
        bestError = error;
      }
    }
  }
  return { transform: inliers.length >= MIN_ANCHORS ? fit(inliers) : null, inliers };
}

/**
 * 短窗口二维运动补偿实验：仅补偿最近 100ms，不估计新的 yaw/pitch 或表情。
 * 仅持有小图与关键点；任何不确定性均返回 null，由调用方同帧恢复完整推理。
 */
export class FaceMotionTracker {
  private readonly matchErrors = new Float32Array((SEARCH_RADIUS * 2 + 1) ** 2);
  private canvas: OffscreenCanvas | null = null;
  private context: OffscreenCanvasRenderingContext2D | null = null;
  private reference: GrayImage | null = null;
  private crop: Crop | null = null;
  private result: FaceLandmarkerResult | null = null;
  private anchors: Anchor[] = [];
  private regions: Region[] = [];
  private frameWidth = 0;
  private frameHeight = 0;
  private faceWidth = 0;
  private faceHeight = 0;
  private seededAt = -Infinity;
  private lastTime = -Infinity;
  private destroyed = false;

  constructor(private readonly imageReader?: FaceMotionImageReader) {}

  public seed(frame: FrameContext, landmarks: FaceLandmarkerResult): boolean {
    this.reset();
    if (this.destroyed || landmarks.faceLandmarks.length !== 1) return false;
    const points = landmarks.faceLandmarks[0];
    // 刚性矩阵/表情系数不能由二维补偿伪造；调用方须仅给不需要这些能力的 mesh 使用。
    if (points.length < 468 || points.some((p) => !Number.isFinite(p.x + p.y + p.z))) return false;
    if (!Number.isFinite(frame.width + frame.height) || frame.width <= 0 || frame.height <= 0) return false;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const point of points) {
      left = Math.min(left, point.x * frame.width);
      right = Math.max(right, point.x * frame.width);
      top = Math.min(top, point.y * frame.height);
      bottom = Math.max(bottom, point.y * frame.height);
    }
    const faceWidth = right - left;
    const faceHeight = bottom - top;
    if (
      faceWidth < 40 ||
      faceHeight < 40 ||
      left < 0 ||
      top < 0 ||
      right >= frame.width - 1 ||
      bottom >= frame.height - 1
    )
      return false;
    // 整帧缩图会让远处但仍可用的人脸失去纹理；只读取人脸周围，并在整个 seed 窗口固定坐标系。
    const cropLeft = Math.max(0, Math.floor(left - faceWidth * 0.3));
    const cropTop = Math.max(0, Math.floor(top - faceHeight * 0.3));
    this.crop = {
      x: cropLeft,
      y: cropTop,
      width: Math.min(frame.width, Math.ceil(right + faceWidth * 0.3)) - cropLeft,
      height: Math.min(frame.height, Math.ceil(bottom + faceHeight * 0.3)) - cropTop
    };
    this.frameWidth = frame.width;
    this.frameHeight = frame.height;
    const image = this.read(frame);
    if (!image) return this.failSeed();
    const start = this.toImage({ x: left / frame.width, y: top / frame.height }, image);
    const end = this.toImage({ x: right / frame.width, y: bottom / frame.height }, image);
    this.faceWidth = end.x - start.x;
    this.faceHeight = end.y - start.y;
    if (this.faceWidth < 40 || this.faceHeight < 40 || !inside(image, start.x, start.y) || !inside(image, end.x, end.y))
      return this.failSeed();
    for (const index of STABLE_POINTS) {
      const point = this.toImage(points[index], image);
      let best: Anchor | null = null;
      // 人脸网格点未必正好落在纹理角点，在很小邻域内找可跟踪的纹理。
      for (let y = -2; y <= 2; y += 2) {
        for (let x = -2; x <= 2; x += 2) {
          const anchor = patchAt(image, point.x + x, point.y + y);
          if (anchor && (!best || anchor.energy > best.energy)) best = anchor;
        }
      }
      // 有角点也可能是重复纹理；自匹配不唯一的 patch 不能计入后续一致性门槛的分母。
      if (
        best &&
        !this.anchors.some((a) => Math.hypot(a.x - best!.x, a.y - best!.y) < 4) &&
        matchAnchor(image, best, this.matchErrors)
      )
        this.anchors.push(best);
    }
    if (!this.spread(this.anchors)) return this.failSeed();
    for (const indices of EXPRESSION_REGIONS) {
      const region = this.makeRegion(
        image,
        indices.map((i) => this.toImage(points[i], image))
      );
      if (!region) return this.failSeed();
      this.regions.push(region);
    }
    this.reference = image;
    this.result = {
      faceLandmarks: [points.map((point) => ({ ...point }))],
      faceBlendshapes: [],
      facialTransformationMatrixes: []
    };
    this.seededAt = this.lastTime = this.time(frame);
    return Number.isFinite(this.seededAt) || this.failSeed();
  }

  public track(frame: FrameContext): FaceMotionResult {
    const reject = (reason: string): FaceMotionResult => {
      this.reset();
      return { landmarks: null, confidence: 0, reason };
    };
    if (this.destroyed || !this.reference || !this.result) return reject('unseeded');
    const time = this.time(frame);
    if (!Number.isFinite(time) || time <= this.lastTime || time - this.seededAt > MAX_AGE_MS) return reject('expired');
    if (frame.width !== this.frameWidth || frame.height !== this.frameHeight) return reject('dimensions');
    const image = this.read(frame);
    if (!image || image.width !== this.reference.width || image.height !== this.reference.height)
      return reject('readback');
    const matches: Match[] = [];
    for (const anchor of this.anchors) {
      const match = matchAnchor(image, anchor, this.matchErrors);
      if (match) matches.push(match);
    }
    const { transform, inliers } = robustFit(matches);
    if (
      !transform ||
      inliers.length < Math.ceil(this.anchors.length * 0.75) ||
      !this.spread(inliers.map((m) => m.from))
    )
      return reject('inconsistent-motion');
    const scale = Math.hypot(transform.a, transform.b);
    if (scale < 0.94 || scale > 1.06 || Math.abs(Math.atan2(transform.b, transform.a)) > Math.PI / 30)
      return reject('large-motion');
    // 在全局变换后检查眼口残差；不能把头部跟随成功误当成表情没有变化。
    for (const region of this.regions) {
      if (!this.regionMatches(image, region, transform)) return reject('expression-or-occlusion');
    }
    const output = [];
    for (const point of this.result.faceLandmarks[0]) {
      const moved = apply(transform, this.toImage(point, image));
      if (!inside(image, moved.x, moved.y)) return reject('out-of-bounds');
      const crop = this.crop!;
      output.push({
        ...point,
        x: (crop.x + (moved.x / image.width) * crop.width) / this.frameWidth,
        y: (crop.y + (moved.y / image.height) * crop.height) / this.frameHeight,
        z: point.z * scale
      });
    }
    this.lastTime = time;
    const error = inliers.reduce((total, match) => total + match.error, 0) / inliers.length;
    return {
      landmarks: { faceLandmarks: [output], faceBlendshapes: [], facialTransformationMatrixes: [] },
      confidence: Math.max(0, Math.min(1, (inliers.length / this.anchors.length) * (1 - error / 0.2)))
    };
  }

  public reset(): void {
    this.reference = this.result = null;
    this.crop = null;
    this.anchors = [];
    this.regions = [];
    this.seededAt = this.lastTime = -Infinity;
    this.faceWidth = this.faceHeight = this.frameWidth = this.frameHeight = 0;
  }

  public destroy(): void {
    this.reset();
    this.destroyed = true;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = this.context = null;
  }

  private failSeed(): false {
    this.reset();
    return false;
  }

  private time(frame: FrameContext) {
    return Number.isFinite(frame.videoFrame.timestamp) ? frame.videoFrame.timestamp / 1000 : frame.timestamp;
  }

  private toImage(point: Point, image: GrayImage): Point {
    const crop = this.crop!;
    return {
      x: ((point.x * this.frameWidth - crop.x) / crop.width) * image.width,
      y: ((point.y * this.frameHeight - crop.y) / crop.height) * image.height
    };
  }

  private read(frame: FrameContext): GrayImage | null {
    if (this.destroyed || !this.crop) return null;
    try {
      const crop = this.crop;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(crop.width, crop.height));
      const width = Math.max(1, Math.round(crop.width * scale));
      const height = Math.max(1, Math.round(crop.height * scale));
      if (this.imageReader) {
        // reader 的资源由 renderer 持有；失败交回完整推理，避免同帧再做一次昂贵的 Canvas2D 读回。
        const data = this.imageReader(frame, crop, width, height);
        return data instanceof Uint8Array && data.length === width * height ? { data, width, height } : null;
      }
      this.canvas ??= new OffscreenCanvas(width, height);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.context ??= this.canvas.getContext('2d', { willReadFrequently: true });
      if (!this.context) return null;
      this.context.drawImage(frame.videoFrame, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      const rgba = this.context.getImageData(0, 0, width, height).data;
      const data = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i++)
        data[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
      return { data, width, height };
    } catch {
      return null;
    }
  }

  private spread(points: Point[]) {
    if (points.length < MIN_ANCHORS) return false;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const point of points) {
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
    return right - left >= this.faceWidth * 0.35 && bottom - top >= this.faceHeight * 0.3;
  }

  private makeRegion(image: GrayImage, points: Point[]): Region | null {
    const margin = Math.max(2, this.faceWidth * 0.025);
    const left = Math.min(...points.map((p) => p.x)) - margin;
    const right = Math.max(...points.map((p) => p.x)) + margin;
    const top = Math.min(...points.map((p) => p.y)) - margin;
    const bottom = Math.max(...points.map((p) => p.y)) + margin;
    if (!inside(image, left, top) || !inside(image, right, bottom) || right - left < 5 || bottom - top < 4) return null;
    const samples: Point[] = [];
    // 约 100 个采样/区域，覆盖整个眼口而非只有模型提供的几个端点。
    const step = Math.max(1, Math.sqrt(((right - left) * (bottom - top)) / 100));
    for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) samples.push({ x, y });
    const values = Float32Array.from(samples, (p) => sample(image, p.x, p.y));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    let energy = 0;
    for (let i = 0; i < values.length; i++) {
      values[i] -= mean;
      energy += values[i] ** 2;
    }
    return energy / values.length >= 25 ? { points: samples, values, energy } : null;
  }

  private regionMatches(image: GrayImage, region: Region, transform: Similarity) {
    let sum = 0;
    let squares = 0;
    let product = 0;
    for (let i = 0; i < region.points.length; i++) {
      const point = apply(transform, region.points[i]);
      if (!inside(image, point.x, point.y)) return false;
      const value = sample(image, point.x, point.y);
      sum += value;
      squares += value * value;
      product += value * region.values[i];
    }
    const count = region.points.length;
    const currentEnergy = Math.max(0, squares - (sum * sum) / count);
    const difference = Math.max(0, currentEnergy + region.energy - 2 * product);
    // 同时限制绝对和相对误差；允许插值/压缩噪声，不允许明显眼口局部变化。
    return (
      currentEnergy >= region.energy * 0.5 &&
      difference / count <= 100 &&
      difference / (region.energy + count * 64) <= 0.09
    );
  }
}
