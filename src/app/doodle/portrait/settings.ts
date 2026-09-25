export const STICKERS = [
  { id: 'none', name: '不佩戴', icon: '○', preview: '' },
  { id: 'cat', name: '猫咪发夹', icon: '🐱', preview: '/portrait-stickers/cat.png' },
  { id: 'bear', name: '小熊陪伴', icon: '🐻', preview: '/portrait-stickers/bear.png' },
  { id: 'rabbit', name: '兔兔冒泡', icon: '🐰', preview: '/portrait-stickers/rabbit.png' },
  { id: 'alien', name: '星际搭子', icon: '👽', preview: '/portrait-stickers/alien.png' },
  { id: 'crown', name: '软糖王冠', icon: '👑', preview: '/portrait-stickers/crown.png' },
  { id: 'planet', name: '星球环游', icon: '🪐', preview: '/portrait-stickers/planet.png' }
] as const;
export type StickerId = typeof STICKERS[number]['id'];
export const FACE_EFFECTS = [
  { id: 'none', name: '不贴贴', icon: '○', preview: '' },
  { id: 'cat', name: '猫咪贴贴', icon: '🐱', preview: '/portrait-stickers/cat.png' },
  { id: 'fox', name: '小狐探头', icon: '🦊', preview: '/portrait-stickers/fox.png' },
  { id: 'panda', name: '熊猫抱抱', icon: '🐼', preview: '/portrait-stickers/panda.png' },
  { id: 'avatar', name: '独角兽之梦', icon: '🦄', preview: '/portrait-stickers/unicorn.png' }
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
