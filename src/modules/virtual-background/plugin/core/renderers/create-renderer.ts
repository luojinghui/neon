import type { FrameRenderer } from '../types';
import { WebGLRenderer } from './webgl-renderer';

/**
 * 创建 WebGL2 纹理直用合成器。
 *
 * @returns { FrameRenderer } - 调用方负责 initialize、逐帧 render 和 destroy。
 */
export function createRenderer(): FrameRenderer {
  return new WebGLRenderer();
}
