import type { Detection, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { IBackgroundOptions, IFaceStickerPlacement } from '../type';

/** 单帧推理上下文；尺寸使用像素，视频帧由处理器持有和释放。 */
export interface FrameContext {
  videoFrame: VideoFrame;
  width: number;
  height: number;
  /** 推理时间，单位毫秒；输出视频继续使用原始 VideoFrame.timestamp。 */
  timestamp: number;
}

/** bounds 只需检测框；landmarks 需要关键点和姿态，可额外申请表情系数。 */
export type FaceTracking =
  | { mode: 'bounds' }
  | { mode: 'landmarks'; blendshapes?: boolean; transformationMatrixes?: boolean };

export interface FaceFrame extends FrameContext {
  detections: Detection[];
  /** 模型未就绪或正在配置，本次没有推理；与真实检测未发现人脸不同。 */
  inferenceUnavailable?: true;
  /** 缓存跟踪结果实际对应的媒体时间，单位毫秒；复用低频检测框或关键点时提供。 */
  detectionTimestamp?: number;
  /** 保留完整关键点、姿态矩阵及可选表情系数，由各效果自行解释。 */
  landmarks: FaceLandmarkerResult | null;
}

/** 叠加层在未镜像输出帧中的像素区域，原点位于左上角，x 向右、y 向下。 */
export interface RenderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 读取当前视频帧的低分辨率人脸ROI；返回顶部起始、独占的灰度数据，不转移视频帧所有权。 */
export type FaceMotionImageReader = (
  frame: FrameContext,
  crop: RenderRect,
  width: number,
  height: number
) => Uint8Array | null;

/** 后端无关的 3D 绘制描述；效果拥有图片，合成器拥有 GPU 资源。 */
export interface FaceStickerDraw {
  source: HTMLImageElement;
  landmarks: FaceLandmarkerResult;
  placement?: IFaceStickerPlacement;
  fit: 'fill' | 'contain';
  /** 3D 贴纸映射到标准脸后的估算不透明覆盖率；无法分析素材时省略。 */
  faceCoverage?: number;
}

/** 图片布局与网格绘制分别表达，避免效果层持有最终合成器或创建中间画布。 */
export type EffectOverlay =
  | { kind: 'image'; source: CanvasImageSource; rects: RenderRect[] }
  | { kind: 'face-sticker'; sticker: FaceStickerDraw };

/** 原始视频、分割后人像与背景、仅背景、透明底图四种合成策略。 */
export type BaseMode = 'video' | 'segmented' | 'background' | 'transparent';

/** 独立于输出尺寸的分割结果；data 在交付后不可修改。 */
export interface SegmentationMask {
  data: Uint8Array;
  width: number;
  height: number;
  format: 'category' | 'foreground-alpha';
}

/** GPU mask 由合成器持有；这里仅保存缓存尺寸，不暴露借用的 MediaPipe 纹理。 */
export interface GpuSegmentationMask {
  kind: 'gpu';
  width: number;
  height: number;
  format: 'foreground-alpha';
}

/** 模型和合成器共享同一画布；updateMask 必须在 MediaPipe 结果回调返回前完成 GPU 拷贝。 */
export interface GpuMaskTarget {
  canvas: OffscreenCanvas;
  updateMask(texture: WebGLTexture, frame: FrameContext, width: number, height: number): void;
}

/** 仅传递蒙版几何与增益，不跨帧持有 VideoFrame 或 MediaPipe 借用纹理。 */
export interface BeautyFrame {
  brightness: number;
  whitening: number;
  maskMode: 'segment';
  landmarks: FaceLandmarkerResult | null;
  /** 最多 4 张脸的 bottom-origin 归一化框，每张为 left、bottom、width、height。 */
  faceRects: number[];
  /** 每张脸的左右眼中心点，每张为 x1、y1、x2、y2。 */
  faceEyes: number[];
  /** 每张脸的嘴部中心和检测置信度，每张为 x、y、confidence、保留位。 */
  faceMouths: number[];
  faceCount: number;
  /** 贴纸估算遮挡大部分脸部时，暂停局部美白。 */
  whiteningSuppressedBySticker?: boolean;
  /** 快速运动或陈旧结果降低局部强度。 */
  faceStrength: number;
  tracked: boolean;
  /** 美白关键点最近更新的媒体时间，单位毫秒。 */
  timestamp?: number;
}

/** 后端无关的单帧合成参数，所有输入素材均为借用引用。 */
export interface FrameRenderOptions {
  videoFrame: CanvasImageSource;
  baseMode: BaseMode;
  backgroundOptions: IBackgroundOptions;
  backgroundSource: CanvasImageSource | null;
  /** 按帧尺寸逐行排列的类别掩码，0 为人像，其余为背景。 */
  mask?: Uint8Array | null;
  /** 显式使用当前合成器拥有的 GPU mask 缓存。 */
  gpuMask?: boolean;
  maskWidth?: number;
  maskHeight?: number;
  maskFormat?: 'category' | 'foreground-alpha';
  /** 实验 GPU 路径：使用与 mask 同帧的颜色参考做联合双边上采样。 */
  edgeRefinement?: boolean;
  /** 分割边缘的模糊强度，0 表示关闭；具体采样由渲染后端实现。 */
  maskBlur: number;
  overlaySource?: CanvasImageSource | null;
  overlayRects?: RenderRect[];
  /** WebGL2 直接绘制的 3D 贴纸描述。 */
  faceSticker?: FaceStickerDraw | null;
  /** 整体增亮与人像美白。 */
  beauty?: BeautyFrame;
}

export interface FrameRenderer {
  /** 可选实验能力：共享本帧输入纹理生成跟踪小图，资源归渲染器管理。 */
  readonly faceMotionImageReader?: FaceMotionImageReader;
  /** 仅纹理直用后端提供，须在创建模型前固定画布身份。 */
  readonly gpuMaskTarget?: GpuMaskTarget;
  /**
   * 初始化渲染资源或同步输出尺寸。
   * @param { number } width - 输出宽度，单位像素。
   * @param { number } height - 输出高度，单位像素。
   * @returns 同步后端直接返回；异步后端在资源可用后完成 Promise。
   */
  initialize(width: number, height: number): void | Promise<void>;
  /**
   * 将当前帧绘制到内部画布。
   * @param { FrameRenderOptions } options - 底图、背景、分割掩码及叠加层配置。
   * @returns 完成后可创建输出 VideoFrame；WebGL 利用同上下文命令顺序保证读取一致性。
   */
  render(options: FrameRenderOptions): void | Promise<void>;
  /** 获取复用的输出画布；调用方仅借用，不负责释放或调整尺寸。 */
  getCanvas(): OffscreenCanvas;
  /** 释放本后端持有的画布和 GPU 资源，不释放借用的输入素材。 */
  destroy(): void;
}
