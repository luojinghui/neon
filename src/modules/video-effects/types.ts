export const FLAT_STICKERS = [
  { id: 'none', name: '无', icon: '○' },
  { id: 'starlight', name: '星星脸', icon: '✦' },
  { id: 'hearts', name: '桃心', icon: '♡' },
  { id: 'flowers', name: '小花', icon: '✿' },
  { id: 'clouds', name: '云朵', icon: '☁' },
  { id: 'orbit', name: '星轨', icon: '🪐' }
] as const;
export const CALL_BACKGROUNDS = [
  { id: 'original', name: '原背景', color: '#64736e' },
  { id: 'peach', name: '蜜桃', color: '#e5afa6' },
  { id: 'cosmos', name: '星空', color: '#574878' },
  { id: 'mint', name: '薄荷', color: '#9fc8b4' },
  { id: 'sunroom', name: '日光窗', color: '#d9b894' },
  { id: 'hills', name: '小山丘', color: '#9cbaa5' },
  { id: 'grid', name: '奶油格', color: '#e5d7c6' }
] as const;
export const MESH_AVATARS = [
  { id: 'none', name: '原面容', icon: '○' },
  { id: 'avatar', name: '星际旅人', icon: '✦' },
  { id: 'cat', name: '星猫', icon: '🐱' },
  { id: 'fox', name: '赤狐', icon: '🦊' },
  { id: 'panda', name: '熊猫', icon: '🐼' }
] as const;
export type VideoEffectsSettings = {
  whitening: number;
  smoothing: number;
  sticker2d: typeof FLAT_STICKERS[number]['id'];
  faceEffect: 'none' | 'cat' | 'fox' | 'panda' | 'avatar';
  background: typeof CALL_BACKGROUNDS[number]['id'];
};
export const DEFAULT_VIDEO_EFFECTS: VideoEffectsSettings = { whitening: 0, smoothing: 0, sticker2d: 'none', faceEffect: 'none', background: 'original' };
export type VideoEffectsStatus = { phase: 'off' | 'loading' | 'ready' | 'error'; progress: number; message: string; faceDetected?: boolean; fps?: number; inferenceMs?: number; maskAgeMs?: number; backend?: 'worker' | 'main' };
export const effectsEnabled = (value: VideoEffectsSettings) => value.whitening > 0 || value.smoothing > 0 || value.sticker2d !== 'none' || value.faceEffect !== 'none' || value.background !== 'original';
export function normalizeVideoEffects(value: Partial<VideoEffectsSettings>): VideoEffectsSettings {
  const clamp = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  return {
    whitening: clamp(value.whitening), smoothing: clamp(value.smoothing),
    sticker2d: FLAT_STICKERS.some(item => item.id === value.sticker2d) ? value.sticker2d! : 'none',
    faceEffect: ['none', 'cat', 'fox', 'panda', 'avatar'].includes(value.faceEffect || '') ? value.faceEffect! : 'none',
    background: CALL_BACKGROUNDS.some(item => item.id === value.background) ? value.background! : 'original'
  };
}
export interface VideoProcessor {
  configure(settings: VideoEffectsSettings): void;
  start(): Promise<MediaStreamTrack>;
  dispose(): void;
}
export type VideoProcessorFactory = (source: MediaStreamTrack, onStatus: (status: VideoEffectsStatus) => void, onFailure: (error: unknown) => void) => Promise<VideoProcessor>;
