/** Beauty values are percentages. Unknown/removed effect fields are discarded. */
export type VideoEffectsSettings = { whitening: number; smoothing: number };
export const DEFAULT_VIDEO_EFFECTS: VideoEffectsSettings = { whitening: 0, smoothing: 0 };
export type VideoEffectsStatus = {
  phase: 'off' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
  fps?: number;
};
export const effectsEnabled = (value: VideoEffectsSettings) => value.whitening > 0 || value.smoothing > 0;
export function normalizeVideoEffects(value: Partial<VideoEffectsSettings>): VideoEffectsSettings {
  const clamp = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0;
  return { whitening: clamp(value.whitening), smoothing: clamp(value.smoothing) };
}
export interface VideoProcessor {
  configure(settings: VideoEffectsSettings): void;
  start(): Promise<MediaStreamTrack>;
  dispose(): void;
}
export type VideoProcessorFactory = (source: MediaStreamTrack, onStatus: (status: VideoEffectsStatus) => void, onFailure: (error: unknown) => void) => Promise<VideoProcessor>;

/** Keep the caller's aspect ratio and bound GPU work on mobile devices. */
export function beautyFrameSize(width: number, height: number): { width: number; height: number } {
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const inputWidth = valid ? width : 640, inputHeight = valid ? height : 480;
  const scale = Math.min(1, 640 / Math.max(inputWidth, inputHeight));
  return { width: Math.max(1, Math.round(inputWidth * scale)), height: Math.max(1, Math.round(inputHeight * scale)) };
}
