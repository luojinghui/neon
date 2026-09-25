import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { PortraitSettings } from './settings';
import { fitPortraitFrame } from './framing';

export const CARTOON_ASSETS = ['cat', 'fox', 'panda', 'rabbit', 'bear', 'unicorn', 'alien', 'crown', 'planet', 'sparkles', 'hearts'] as const;
export type CartoonAsset = typeof CARTOON_ASSETS[number];
type V3 = [number, number, number];
type Piece = { asset: CartoonAsset; x: number; y: number; size: number; rotation?: number; accent?: boolean };
export type CartoonLayer = { asset: CartoonAsset; vertices: Float32Array; opacity: number; accent: boolean };
const normalize = (v: V3): V3 => { const length = Math.hypot(...v) || 1; return v.map(n => n / length) as V3; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let images: Promise<Map<CartoonAsset, HTMLImageElement>> | undefined;
export function loadCartoonImages() {
  return images ||= Promise.all(CARTOON_ASSETS.map(async asset => {
    const image = new Image(); image.src = `/portrait-stickers/${asset}.png`; await image.decode();
    return [asset, image] as const;
  })).then(entries => new Map(entries)).catch(error => { images = undefined; throw error; });
}

// Transparent illustrated characters sit beside the face and in the hair, never fill the face mesh.
function companions(effect: PortraitSettings['faceEffect']): Piece[] {
  if (effect === 'none') return [];
  const asset = { cat: 'cat', fox: 'fox', panda: 'panda', avatar: 'unicorn' }[effect] as CartoonAsset;
  return [
    { asset, x: .56, y: -.60, size: .42, rotation: -.12 },
    { asset: effect === 'avatar' ? 'sparkles' : 'hearts', x: -.50, y: -.48, size: .25, rotation: .15 },
    { asset: 'sparkles', x: .65, y: -.22, size: .18 }
  ];
}
function headwear(sticker: PortraitSettings['sticker']): Piece[] {
  if (sticker === 'none') return [];
  if (sticker === 'crown') return [{ asset: 'crown', x: 0, y: .12, size: .78 }, { asset: 'sparkles', x: .52, y: .10, size: .23, accent: true }];
  if (sticker === 'planet') return [{ asset: 'planet', x: -.16, y: .18, size: .64, rotation: -.15 }, { asset: 'sparkles', x: .42, y: .10, size: .28, accent: true }];
  return [
    { asset: sticker, x: -.26, y: .10, size: sticker === 'rabbit' ? .54 : .46, rotation: .12 },
    { asset: 'hearts', x: .30, y: .13, size: .31, rotation: -.18 },
    { asset: 'sparkles', x: -.57, y: -.01, size: .20, accent: true }
  ];
}

/** Project textured cards through the head's 3D basis; the original face remains untouched. */
export function layoutCartoonStickers(face: NormalizedLandmark[], settings: PortraitSettings, aspect: number, autoFrame = true) {
  const layers: CartoonLayer[] = [], points: [number, number][] = [];
  if (face.length < 455 || !Number.isFinite(aspect) || aspect <= 0) return { layers, view: { zoom: 1, offset: [0, 0] } };
  const vector = (a: number, b: number): V3 => [face[a].x - face[b].x, -(face[a].y - face[b].y) / aspect, -(face[a].z - face[b].z)];
  const right = normalize(vector(263, 33)), forward = normalize(cross(right, normalize(vector(10, 152)))), up = normalize(cross(forward, right));
  const width = Math.hypot(face[454].x - face[234].x, (face[454].y - face[234].y) / aspect) * 2;
  if (!Number.isFinite(width) || width < .001) return { layers, view: { zoom: 1, offset: [0, 0] } };
  const origin = [face[10].x * 2 - 1, 1 - face[10].y * 2];
  const project = (x: number, y: number): [number, number, number] => [origin[0] + (right[0] * x + up[0] * y + forward[0] * .06) * width, origin[1] + (right[1] * x + up[1] * y + forward[1] * .06) * width * aspect, -(right[2] * x + up[2] * y) * .1];
  for (const [pieces, accessory] of [[settings.faceEffectStrength > 0 ? companions(settings.faceEffect) : [], false], [headwear(settings.sticker), true]] as const) {
    const group: CartoonLayer[] = [];
    for (const piece of pieces) {
      const scale = accessory ? settings.stickerScale : 1;
      const angle = accessory ? settings.stickerRotation * Math.PI / 180 : 0;
      const turn = (x: number, y: number) => [Math.cos(angle) * x - Math.sin(angle) * y, Math.sin(angle) * x + Math.cos(angle) * y];
      const positions = [[-.5, .5, 0, 0], [.5, .5, 1, 0], [-.5, -.5, 0, 1], [.5, -.5, 1, 1]].map(([x, y, u, v]) => {
        const r = piece.rotation || 0;
        const [px, py] = turn(piece.x + (x * Math.cos(r) - y * Math.sin(r)) * piece.size, piece.y + (x * Math.sin(r) + y * Math.cos(r)) * piece.size);
        return [...project(px * scale, (py + (accessory ? settings.stickerY : 0)) * scale), u, v];
      });
      group.push({ asset: piece.asset, vertices: new Float32Array([0, 2, 1, 1, 2, 3].flatMap(index => positions[index])), opacity: accessory ? 1 : settings.faceEffectStrength / 100, accent: Boolean(piece.accent) });
    }
    // In video, tuck tall headwear inside the frame without zooming or shifting the person's video.
    const top = Math.max(-1, ...group.flatMap(layer => Array.from(layer.vertices).filter((_, index) => index % 5 === 1)));
    const dy = !autoFrame && accessory ? Math.min(0, .96 - top) : 0;
    for (const layer of group) {
      for (let i = 0; i < layer.vertices.length; i += 5) { layer.vertices[i + 1] += dy; points.push([layer.vertices[i], layer.vertices[i + 1]]); }
      layers.push(layer);
    }
  }
  return { layers, view: autoFrame && layers.length ? fitPortraitFrame(points) : { zoom: 1, offset: [0, 0] } };
}
