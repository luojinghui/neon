import type { EffectSelection } from './settings';

const asset = (name: string) => `/virtual/assets/${name}`;

export interface EffectTile {
  id: string;
  label: string;
  selection: EffectSelection;
  preview?: string;
}

const none = (label = '无'): EffectTile => ({ id: 'NONE', label, selection: { type: 'NONE', id: 'NONE' } });

export const BACKGROUND_TILES: EffectTile[] = [
  none(),
  { id: 'blur', label: '虚化', selection: { type: 'BLUR', id: 'blur', level: 20 } },
  { id: 'jiaoshi', label: '教室', preview: asset('jiaoshi_720.png'), selection: { type: 'IMAGE', id: 'jiaoshi', url: asset('jiaoshi_720.png') } },
  { id: 'shujia', label: '书架', preview: asset('shujia_720.png'), selection: { type: 'IMAGE', id: 'shujia', url: asset('shujia_720.png') } },
  { id: 'taikong', label: '太空', preview: asset('taikong_720.png'), selection: { type: 'IMAGE', id: 'taikong', url: asset('taikong_720.png') } },
  { id: 'video-bg', label: '动态', preview: asset('videoBgImage.png'), selection: { type: 'VIDEO', id: 'video-bg', url: asset('videobg.mp4') } },
  { id: 'video-1', label: '光斑', preview: asset('video1_bg.png'), selection: { type: 'VIDEO', id: 'video-1', url: asset('video1.mp4') } },
  { id: 'video-2', label: '城市', preview: asset('video2_bg.png'), selection: { type: 'VIDEO', id: 'video-2', url: asset('video2.mp4') } },
  { id: 'video-3', label: '夜色', preview: asset('video3_bg.png'), selection: { type: 'VIDEO', id: 'video-3', url: asset('video3.mp4') } },
  { id: 'video-4', label: '山湖', preview: asset('video4_bg.png'), selection: { type: 'VIDEO', id: 'video-4', url: asset('video4.mp4') } },
  { id: 'color', label: '纯色', selection: { type: 'COLOR', id: 'color', color: '#f08080' } }
];

const faces = ['04', '05', '06', '07', '01', '02', '03', '08'];

export const STICKER_TILES: EffectTile[] = [
  none(),
  ...faces.map((index) => {
    const url = asset(`head-${index}.png`);
    return { id: `sticker-${index}`, label: `贴纸 ${Number(index)}`, preview: url, selection: { type: 'FACE_STICKY', id: `sticker-${index}`, url } };
  })
];

export const AVATAR_TILES: EffectTile[] = [
  none(),
  ...faces.map((index) => {
    const url = asset(`head-${index}.png`);
    return { id: `avatar-${index}`, label: `头像 ${Number(index)}`, preview: url, selection: { type: 'HEAD_VIRTUAL', id: `avatar-${index}`, url } };
  })
];

export const VIRTUAL_MODEL_PATH = '/virtual/model/v1.0.1';
