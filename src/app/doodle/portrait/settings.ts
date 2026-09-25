export const STICKERS = [
  { id: 'none', name: '不佩戴', icon: '○' },
  { id: 'cat', name: '奶油猫耳', icon: '🐱' },
  { id: 'bear', name: '软糖小熊', icon: '🐻' },
  { id: 'rabbit', name: '云朵兔兔', icon: '🐰' },
  { id: 'alien', name: '星际触角', icon: '👽' },
  { id: 'crown', name: '幸运王冠', icon: '👑' },
  { id: 'planet', name: '环游土星', icon: '🪐' }
] as const;
export type StickerId = typeof STICKERS[number]['id'];
export const FACE_EFFECTS = [
  { id: 'none', name: '保留原貌', icon: '☺' },
  { id: 'cat', name: '奶油猫脸', icon: '🐱' },
  { id: 'fox', name: '森林小狐', icon: '🦊' },
  { id: 'panda', name: '团子熊猫', icon: '🐼' },
  { id: 'avatar', name: '漫画主角', icon: '🎭' }
] as const;
export type FaceEffectId = typeof FACE_EFFECTS[number]['id'];
export const BACKGROUNDS = [{ id: 'original', name: '原场景' }, { id: 'peach', name: '蜜桃云' }, { id: 'cosmos', name: '小宇宙' }, { id: 'mint', name: '薄荷岛' }] as const;
export const MOODS = ['元气满格', '松弛营业', '发呆充电', '好运降落', '冒险启程', '快乐加倍'];
export const STICKER_COLORS = ['#ffadcb', '#a8a0ff', '#ffdc7b', '#8de3c4', '#addbff', '#fff1df'];
export type PortraitSettings = {
  whitening: number; smoothing: number; cartoon: number; outline: number;
  faceEffect: FaceEffectId; faceEffectStrength: number;
  background: typeof BACKGROUNDS[number]['id'];
  sticker: StickerId; stickerColor: string; stickerScale: number; stickerY: number; stickerRotation: number; faceIndex: number;
  mood: string; caption: string; signature: string; decoration: 'spark' | 'hearts' | 'orbit' | 'none';
};
export const DEFAULT_PORTRAIT: PortraitSettings = { whitening: 25, smoothing: 20, cartoon: 15, outline: 0, faceEffect: 'none', faceEffectStrength: 90, background: 'original', sticker: 'cat', stickerColor: '#ffadcb', stickerScale: 1, stickerY: 0, stickerRotation: 0, faceIndex: 0, mood: '元气满格', caption: '把平凡的一天，过成限定款', signature: '', decoration: 'spark' };
const clamp = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function normalizePortrait(value: Partial<PortraitSettings> = {}): PortraitSettings {
  return {
    whitening: clamp(value.whitening, 0, 100, 25), smoothing: clamp(value.smoothing, 0, 100, 20), cartoon: clamp(value.cartoon, 0, 100, 15), outline: clamp(value.outline, 0, 100, 0),
    faceEffect: FACE_EFFECTS.some(item => item.id === value.faceEffect) ? value.faceEffect! : 'none',
    faceEffectStrength: clamp(value.faceEffectStrength, 0, 100, 90),
    background: BACKGROUNDS.some(item => item.id === value.background) ? value.background! : 'original',
    sticker: STICKERS.some(item => item.id === value.sticker) ? value.sticker! : 'cat',
    stickerColor: /^#[0-9a-f]{6}$/i.test(value.stickerColor || '') ? value.stickerColor! : DEFAULT_PORTRAIT.stickerColor,
    stickerScale: clamp(value.stickerScale, 0.6, 1.5, 1), stickerY: clamp(value.stickerY, -0.6, 0.6, 0), stickerRotation: clamp(value.stickerRotation, -45, 45, 0), faceIndex: clamp(value.faceIndex, 0, 2, 0),
    mood: typeof value.mood === 'string' ? value.mood.slice(0, 10) : DEFAULT_PORTRAIT.mood,
    caption: typeof value.caption === 'string' ? value.caption.slice(0, 36) : DEFAULT_PORTRAIT.caption,
    signature: typeof value.signature === 'string' ? value.signature.slice(0, 12) : '',
    decoration: ['spark', 'hearts', 'orbit', 'none'].includes(value.decoration || '') ? value.decoration! : 'spark'
  };
}
