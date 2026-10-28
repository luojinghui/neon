/** 通话画面效果。美颜强度为百分比，素材地址只接受本站虚拟背景资源。 */
export interface EffectSelection {
  type: string;
  id: string;
  url?: string;
  level?: number;
  color?: string;
}

export interface CallVideoSettings {
  brightness: number;
  whitening: number;
  background: EffectSelection;
  sticker: EffectSelection;
  avatar: EffectSelection;
}

export const NONE_EFFECT: EffectSelection = { type: 'NONE', id: 'NONE' };

export const DEFAULT_CALL_VIDEO: CallVideoSettings = {
  brightness: 0,
  whitening: 0,
  background: { ...NONE_EFFECT },
  sticker: { ...NONE_EFFECT },
  avatar: { ...NONE_EFFECT }
};

const BACKGROUND_TYPES = ['NONE', 'BLUR', 'IMAGE', 'VIDEO', 'COLOR'];
const STICKER_TYPES = ['NONE', 'FACE_STICKY', 'FACE_STICKY_3D'];
const AVATAR_TYPES = ['NONE', 'HEAD_VIRTUAL'];

function clamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0;
}

function selection(value: unknown, allowed: string[]): EffectSelection {
  if (!value || typeof value !== 'object') return { ...NONE_EFFECT };
  const item = value as Record<string, unknown>;
  const type = typeof item.type === 'string' && allowed.includes(item.type) ? item.type : 'NONE';
  if (type === 'NONE') return { ...NONE_EFFECT };
  const id = typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 64 ? item.id : type;
  const url = typeof item.url === 'string' && item.url.startsWith('/virtual/') ? item.url : undefined;
  const level = typeof item.level === 'number' && Number.isFinite(item.level) ? Math.round(Math.max(0, Math.min(100, item.level))) : undefined;
  const color = typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : undefined;
  if ((type === 'IMAGE' || type === 'VIDEO' || type === 'FACE_STICKY' || type === 'FACE_STICKY_3D' || type === 'HEAD_VIRTUAL') && !url) return { ...NONE_EFFECT };
  return { type, id, ...(url ? { url } : {}), ...(level !== undefined ? { level } : {}), ...(color ? { color } : {}) };
}

/** 丢弃未知字段，并把强度限制在 0～100。 */
export function normalizeCallVideo(value: Partial<CallVideoSettings>): CallVideoSettings {
  return {
    brightness: clamp(value.brightness),
    whitening: clamp(value.whitening),
    background: selection(value.background, BACKGROUND_TYPES),
    sticker: selection(value.sticker, STICKER_TYPES),
    avatar: selection(value.avatar, AVATAR_TYPES)
  };
}

export function callVideoEnabled(value: Partial<CallVideoSettings>): boolean {
  const active = (item?: EffectSelection) => !!item && item.type !== 'NONE';
  return (value.brightness ?? 0) > 0 || (value.whitening ?? 0) > 0 || active(value.background) || active(value.sticker) || active(value.avatar);
}

export interface CallVideoProcessor {
  configure(settings: CallVideoSettings): void;
  start(): Promise<MediaStreamTrack>;
  dispose(): void;
}

export type CallVideoProcessorFactory = (
  source: MediaStreamTrack,
  onStatus: (status: { phase: 'off' | 'loading' | 'ready' | 'error'; progress: number; message: string }) => void,
  onFailure: (error: unknown) => void
) => Promise<CallVideoProcessor>;
