/**
 * Plugin Types
 *
 * @summary short description for the file
 * @author JingHui Luo <luojinghui424@gmail.com>
 *
 * Created at     : 2023-11-17 11:37:03
 * Last modified  : 2024-11-15 16:28:12
 */

import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * 虚拟背景类型
 *
 * @property NONE - 无效果
 * @property BLUR - 背景虚化
 * @property IMAGE - 图片背景
 * @property VIDEO - 视频背景
 * @property STREAM - MediaStream背景
 * @property COLOR - 纯色背景
 * @property FACE_STICKY - 贴纸
 * @property FACE_STICKY_3D - 随人脸姿态透视变换或贴合人脸网格的图片贴纸
 * @property HEAD_VIRTUAL - 虚拟头像
 */
export enum VirtualType {
  NONE = 'NONE',
  BLUR = 'BLUR',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  STREAM = 'STREAM',
  COLOR = 'COLOR',
  FACE_STICKY = 'FACE_STICKY',
  FACE_STICKY_3D = 'FACE_STICKY_3D',
  HEAD_VIRTUAL = 'HEAD_VIRTUAL'
}

/**
 * 虚拟类型
 *
 * @property BACKGROUND - 虚拟背景
 * @property STICKY - 头像贴纸
 * @property HEAD - 虚拟头像
 */
export enum VirtualKind {
  BACKGROUND = 'BACKGROUND',
  STICKY = 'STICKY',
  HEAD = 'HEAD'
}

export enum PluginType {
  VIDEO_INPUT = 'VIDEO_INPUT',
  AUDIO_INPUT = 'AUDIO_INPUT'
}

export interface IBackgroundOptions {
  type: VirtualType;
  url?: string;
  level?: number;
  color?: string;
  stream?: MediaStream | null;
}

export interface IStickyOptions {
  type: VirtualType;
  url: string;
  /** 2D 或 3D 网格贴纸的缩放方式，默认 fill 拉伸填充；contain 保持可见内容比例；3D 平面忽略此项。 */
  fit?: 'fill' | 'contain';
  /** 3D 图片贴纸的定位参数，仅 FACE_STICKY_3D 生效。 */
  placement?: IFaceStickerPlacement;
}

/** 3D 图片贴纸的位置和尺寸，使用未镜像的视频坐标。 */
export interface IFaceStickerPlacement {
  /** 默认 plane 保持图片比例并跟随姿态；mesh 按人脸网格变形，忽略以下平面定位参数。 */
  mode?: 'plane' | 'mesh';
  /** 平面模式图片中心的锚点，默认 face（额头与下巴中点）。 */
  anchor?: 'face' | 'eyes' | 'forehead' | 'nose';
  /** 图片宽度相对于脸宽的倍数，必须大于 0，默认 1.25。 */
  scale?: number;
  /** 相对于锚点的局部偏移，单位为脸宽；x 向右、y 向上、z 朝向摄像头，默认 [0, 0, 0]。 */
  offset?: [number, number, number];
  /** face 锚点下按可见下沿限制面具覆盖范围，超出下巴时沿脸部向上修正；默认 false。 */
  constrainToChin?: boolean;
}

export interface IVirtualHeadOptions {
  type: VirtualType;
  url: string;
}

/** 新增人脸效果时在此扩展配置联合类型，处理器不需要识别具体效果。 */
export type FaceEffectOptions = IStickyOptions | IVirtualHeadOptions;
export type VirtualEffectOptions = IBackgroundOptions | FaceEffectOptions;

/** WebGL2 画面调节；默认关闭。人脸美白复用人像分割蒙版。 */
export interface IBeautyOptions {
  /** 兼容旧接口的总开关；新接入方同时显式设置两个独立开关。 */
  enabled: boolean;
  /** 整体增亮开关；省略时沿用 enabled，不影响人脸美白。 */
  brightnessEnabled?: boolean;
  /** 人脸美白开关；省略时沿用 enabled，不影响整体增亮。 */
  whiteningEnabled?: boolean;
  /** 整体中间调增亮，0～1；保留黑位与高光。 */
  brightness: number;
  /** 人像范围内的皮肤美白，0～1，不含磨皮。 */
  whitening: number;
}

export interface IProcessTrack {
  /** 待处理或已处理的视频轨道；不支持的轨道类型由处理器原样返回。 */
  track: MediaStreamTrack;
  /** 处理画布宽度，单位像素，应与输入视频帧尺寸一致。 */
  width: number;
  /** 处理画布高度，单位像素，应与输入视频帧尺寸一致。 */
  height: number;
  /** 订阅输出帧尺寸，订阅时同步提供当前尺寸；换源或销毁后旧订阅失效。 */
  onSizeChange?: (listener: (size: { width: number; height: number }) => void) => () => void;
}

/** 单帧性能观测，所有耗时均为毫秒。 */
export interface VideoPerformanceSample {
  timestamp: number;
  inputWidth: number;
  inputHeight: number;
  maskWidth: number;
  maskHeight: number;
  segmentationMs: number;
  faceMs: number;
  /** 本帧是否执行独立人脸框检测；复用缓存或美白关键点时为 false，与是否检出人脸无关。 */
  faceDetectorRan?: boolean;
  /** 本帧是否实际调用关键点模型（包含失败调用）；复用缓存时为 false。 */
  faceLandmarkerRan?: boolean;
  /** 本帧所有人脸模型推理耗时之和，含检测输入准备与重试，不含贴纸布局和渲染。 */
  faceInferenceMs?: number;
  /** 本帧实际检测调用数，包含低分辨率丢脸后的原尺寸重试。 */
  faceInferenceCount?: number;
  /** 主跟踪结果年龄；2D + 美白时为贴纸检测框，帧间图像补偿不清零。 */
  faceAgeMs?: number;
  /** 帧间小图准备和运动跟踪耗时，包含失败尝试，不含完整模型推理。 */
  faceMotionMs?: number;
  /** 本帧使用了图像运动观测更新网格；不计作模型推理。 */
  faceMotionTracked?: boolean;
  faceMotionConfidence?: number;
  /** 帧间观测不可靠，本帧提前恢复完整推理。 */
  faceMotionFallback?: boolean;
  /** 实验不可用或开销过高，已恢复常规推理节拍。 */
  faceMotionUnavailable?: boolean;
  /** 当前使用高于配置常态频率的节拍，包括质量保护升频。 */
  faceMotionBoosted?: boolean;
  /** 主跟踪调度间隔；2D + 美白时为贴纸节拍，两路实际频率分别由模型执行标志统计。 */
  faceTrackingIntervalMs?: number;
  /** 本帧人脸推理或效果绘制描述生成失败；正常未检出人脸不算失败。 */
  faceEffectFailed?: boolean;
  /** 从最终画布创建输出帧的墙钟耗时。 */
  outputFrameMs?: number;
  /** WebGL2 合成提交耗时，不含 GPU 完成等待。 */
  renderMs: number;
  totalMs: number;
  segmented: boolean;
  maskAgeMs: number;
  failed: boolean;
  /** 本帧失败原因，实验面板据此明确提示原帧透传，避免误判为优化成功。 */
  failureReason?: string;
  /** 美白当前是否有有效脸部区域；未启用美白时为 undefined。 */
  beautyFaceDetected?: boolean;
  /** 人像美白不跟踪人脸，此字段保持未设置。 */
  beautyTracked?: boolean;
  /** 美白因 3D 贴纸估算覆盖大部分脸部而暂停。 */
  beautyWhiteningSuppressed?: boolean;
}

/** 视频处理器配置；性能实验仅显式启用，不改变既有接入方的默认路径。 */
export interface IVideoProcessorConfig {
  /** 模型及配套 xylink_vision.js / WASM 文件所在目录，末尾斜杠可省略。 */
  modelPath?: string;
  /** 人像分割边缘模糊强度，默认 0；不影响贴纸图片本身。 */
  maskBlur?: number;
  /** 人脸推理独立于输出帧率；仅影响检测输入，不缩小最终视频。 */
  faceTracking?: {
    /** 3D 稳态关键点频率，默认 20Hz；明显运动时临时提升至 30Hz。 */
    landmarkFps?: 10 | 15 | 20 | 30;
    /** 默认 true；关闭后不按模型运动结果主动升频，帧间跟踪失败的质量保护仍生效。 */
    motionBoost?: boolean;
    /** 实验：低频 mesh 推理间使用小图运动观测，仅支持无需表情系数/姿态矩阵的 mesh，默认关闭。 */
    experimentalInterFrameTracking?: boolean;
    /** 默认 source 不缩图；可选 480/640 需按设备验证收益，小脸和周期重定位仍使用原尺寸。 */
    maxDimension?: 480 | 640 | 'source';
  };
  /** 纹理直用的分割节拍与 GPU mask 缓存；省略时使用 15 次/秒、长边 256、边缘增强开启。 */
  experimentalPerformance?: {
    /** 分割更新上限，默认 15 次/秒；输出仍跟随输入帧率。 */
    segmentationFps?: number;
    /** GPU mask 缓存长边，默认 256；不改变模型张量尺寸，也不预先缩小输入帧。 */
    segmentationMaxDimension?: 256 | 384 | 512;
    /** 以原画颜色引导小 mask 的边缘上采样，默认开启。 */
    edgeRefinement?: boolean;
  };
  /** 可选逐帧观测；调用方应批量更新 UI，耗时均为墙钟时间。 */
  onPerformanceSample?: (sample: VideoPerformanceSample) => void;
  /** 兼容旧版本的透传字段，当前模型加载流程不使用此值。 */
  vision?: unknown;
  /** 可选的已初始化分割模型；处理器仅借用，不负责关闭外部实例。 */
  imageSegmenter?: ImageSegmenter;
  /** 可选的已初始化人脸检测模型；处理器仅借用，不负责关闭外部实例。 */
  faceDetector?: FaceDetector;
}

/**
 * 运行中可更新的配置。以调用时已提交配置为基准，嵌套对象局部合并；
 * experimentalPerformance: null 恢复默认分割参数。模型路径和观测回调保持创建时配置。
 */
export interface IVideoProcessorConfigPatch {
  maskBlur?: number;
  faceTracking?: IVideoProcessorConfig['faceTracking'];
  experimentalPerformance?: IVideoProcessorConfig['experimentalPerformance'] | null;
  /** 与分割参数一起提交的美颜配置。 */
  beauty?: IBeautyOptions;
}
