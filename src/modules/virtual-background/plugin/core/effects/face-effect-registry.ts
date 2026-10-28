import { VirtualType } from '../../type';
import type { FaceEffectFactory, FaceEffectRegistry } from './face-effect';
import { ImageFaceEffect } from './image-face/image-face-effect';
import { ImageStickerEffect } from './image-sticker-3d/image-sticker-effect';

/** 新增 glTF/网格效果时在此注册，模型调度、合成器与 Processor 无需识别新类型。 */
export const faceEffectRegistry: FaceEffectRegistry = new Map<VirtualType, FaceEffectFactory>([
  [VirtualType.FACE_STICKY, (options) => new ImageFaceEffect(options)],
  [VirtualType.HEAD_VIRTUAL, (options) => new ImageFaceEffect(options)],
  [VirtualType.FACE_STICKY_3D, (options) => new ImageStickerEffect(options)]
]);
