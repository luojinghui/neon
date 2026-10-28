import type { IBeautyOptions, IVideoProcessorConfig, IVideoProcessorConfigPatch } from '../type';

const DEFAULT_PERFORMANCE = {
  segmentationFps: 15,
  segmentationMaxDimension: 256 as const,
  edgeRefinement: true
};

/** 仅复制配置值；回调和调用方持有的模型实例保留原引用。分割参数缺省时使用纹理直用默认值。 */
export function copyRuntimeConfig(config: IVideoProcessorConfig): IVideoProcessorConfig {
  const source = { ...config } as IVideoProcessorConfig & { renderBackend?: unknown };
  delete source.renderBackend;
  return {
    ...source,
    ...(source.faceTracking ? { faceTracking: { ...source.faceTracking } } : {}),
    experimentalPerformance: { ...DEFAULT_PERFORMANCE, ...source.experimentalPerformance }
  };
}

function assertFields(value: unknown, fields: string[], name: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}需为配置对象`);
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new Error(`${name}不支持字段：${key}`);
  }
}

export function validateBeautyOptions(options: IBeautyOptions) {
  assertFields(options, ['enabled', 'brightnessEnabled', 'whiteningEnabled', 'brightness', 'whitening'], '美颜配置');
  if (
    typeof options.enabled !== 'boolean' ||
    [options.brightnessEnabled, options.whiteningEnabled].some(
      (value) => value !== undefined && typeof value !== 'boolean'
    ) ||
    ![options.brightness, options.whitening].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  ) {
    throw new Error('美颜开关需为布尔值，美颜强度需在 0～1 之间');
  }
}

export function validateRuntimeConfig(config: IVideoProcessorConfig) {
  if (config.imageSegmenter) throw new Error('纹理直用不支持外部分割模型');
  if (config.maskBlur !== undefined && (!Number.isFinite(config.maskBlur) || config.maskBlur < 0)) {
    throw new Error('分割边缘模糊强度需为非负有限数值');
  }
  if (config.faceTracking !== undefined) {
    assertFields(
      config.faceTracking,
      ['landmarkFps', 'motionBoost', 'experimentalInterFrameTracking', 'maxDimension'],
      '人脸跟踪配置'
    );
  }
  if (config.experimentalPerformance !== undefined) {
    assertFields(
      config.experimentalPerformance,
      ['segmentationFps', 'segmentationMaxDimension', 'edgeRefinement'],
      '性能实验配置'
    );
  }
  const fps =
    config.experimentalPerformance?.segmentationFps === undefined ? 15 : config.experimentalPerformance.segmentationFps;
  if (!Number.isFinite(fps) || fps < 10 || fps > 60) throw new Error('分割频率需在 10～60 次/秒之间');
  const maxDimension =
    config.experimentalPerformance?.segmentationMaxDimension === undefined
      ? 256
      : config.experimentalPerformance.segmentationMaxDimension;
  if (![256, 384, 512].includes(maxDimension)) throw new Error('分割输入长边仅支持 256、384、512');
  for (const flag of [
    config.experimentalPerformance?.edgeRefinement,
    config.faceTracking?.motionBoost,
    config.faceTracking?.experimentalInterFrameTracking
  ]) {
    if (flag !== undefined && typeof flag !== 'boolean') throw new Error('实验开关需为布尔值');
  }
  const faceFps = config.faceTracking?.landmarkFps === undefined ? 20 : config.faceTracking.landmarkFps;
  if (![10, 15, 20, 30].includes(faceFps)) throw new Error('3D 关键点频率仅支持 10、15、20、30Hz');
  const faceDimension = config.faceTracking?.maxDimension === undefined ? 'source' : config.faceTracking.maxDimension;
  if (![480, 640, 'source'].includes(faceDimension)) throw new Error('人脸检测输入仅支持 480、640 或 source');
}

export function mergeRuntimeConfig(config: IVideoProcessorConfig, patch: IVideoProcessorConfigPatch) {
  assertFields(patch, ['maskBlur', 'faceTracking', 'experimentalPerformance', 'beauty'], '热更新配置');
  if (patch.faceTracking !== undefined) {
    assertFields(
      patch.faceTracking,
      ['landmarkFps', 'motionBoost', 'experimentalInterFrameTracking', 'maxDimension'],
      '人脸跟踪配置'
    );
  }
  if (patch.experimentalPerformance !== undefined && patch.experimentalPerformance !== null) {
    assertFields(
      patch.experimentalPerformance,
      ['segmentationFps', 'segmentationMaxDimension', 'edgeRefinement'],
      '性能实验配置'
    );
  }
  if (patch.beauty !== undefined) validateBeautyOptions(patch.beauty);
  const next = copyRuntimeConfig(config);
  if (patch.maskBlur !== undefined) next.maskBlur = patch.maskBlur;
  if (patch.faceTracking !== undefined) next.faceTracking = { ...next.faceTracking, ...patch.faceTracking };
  if (patch.experimentalPerformance === null) next.experimentalPerformance = { ...DEFAULT_PERFORMANCE };
  else if (patch.experimentalPerformance !== undefined) {
    next.experimentalPerformance = { ...next.experimentalPerformance, ...patch.experimentalPerformance };
  }
  validateRuntimeConfig(next);
  if (next.imageSegmenter) throw new Error('纹理直用不支持外部分割模型');
  return next;
}
