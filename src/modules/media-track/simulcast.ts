/** 一路 sender 的联播层：采集保持 720P，由编码器按比例缩到 360P / 180P。 */
export const SIMULCAST_LAYERS = [
  { rid: 'l', height: 180, maxBitrate: 150_000, maxFramerate: 15 },
  { rid: 'm', height: 360, maxBitrate: 450_000, maxFramerate: 30 },
  { rid: 'h', height: 720, maxBitrate: 1_200_000, maxFramerate: 30 }
] as const;

const WIDE_RATIO = 16 / 9;

/** 按源画面与目标高度计算 scaleResolutionDownBy，不放大。 */
export function scaleForTarget(sourceWidth: number, sourceHeight: number, targetHeight: number): number {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(targetHeight > 0)) return 1;
  const targetWidth = (targetHeight * 16) / 9;
  const ratio = sourceWidth / sourceHeight;
  const scale = ratio > WIDE_RATIO + 1e-4
    ? (sourceWidth > targetWidth ? sourceWidth / targetWidth : 1)
    : (sourceHeight > targetHeight ? sourceHeight / targetHeight : 1);
  return Math.max(1, Number(scale.toFixed(3)));
}

/** Chrome 要求联播编码从低分辨率到高分辨率排列，且每层有独立 rid。 */
export function peopleSimulcastEncodings(sourceWidth = 1280, sourceHeight = 720): RTCRtpEncodingParameters[] {
  return SIMULCAST_LAYERS.map((layer) => ({
    rid: layer.rid,
    active: true,
    maxBitrate: layer.maxBitrate,
    maxFramerate: layer.maxFramerate,
    scaleResolutionDownBy: scaleForTarget(sourceWidth, sourceHeight, layer.height)
  }));
}

export function trackFrameSize(track?: { getSettings?: () => MediaTrackSettings } | null): { width: number; height: number } {
  const settings = track?.getSettings?.();
  const width = settings?.width;
  const height = settings?.height;
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) return { width, height };
  return { width: 1280, height: 720 };
}
