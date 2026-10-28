import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FaceStickerDraw } from '../../types';
import { createFaceStickerVertices } from './face-sticker-geometry';
import { FaceStickerMeshGeometry } from './face-sticker-mesh-geometry';
import { getStickerContentBounds, type StickerContentBounds } from './sticker-content-bounds';

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec2 texCoord;
uniform bool mesh;
varying vec2 uv;
void main() {
  gl_Position = mesh ? vec4(position, 1.0) : vec4(position.xy, 0.0, position.z);
  uv = texCoord;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D image;
uniform vec4 uvBounds;
uniform bool depthOnly;
uniform bool premultiplyAlpha;
varying vec2 uv;
void main() {
  if (depthOnly) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (uv.x < uvBounds.x || uv.y < uvBounds.y || uv.x > uvBounds.z || uv.y > uvBounds.w) discard;
  vec4 color = texture2D(image, uv);
  if (color.a < 0.004) discard;
  gl_FragColor = vec4(premultiplyAlpha ? color.rgb * color.a : color.rgb, color.a);
}`;

/** 只拥有贴纸 GPU 资源；可借用主 WebGL2 context，也可在兼容画布的 WebGL1 context 绘制。 */
export class FaceStickerDrawRenderer {
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private source: HTMLImageElement | null = null;
  private sourceKey = '';
  private contentBounds: StickerContentBounds | undefined;
  private meshGeometry: FaceStickerMeshGeometry | null = null;
  private positionLocation = -1;
  private texCoordLocation = -1;
  private meshLocation: WebGLUniformLocation | null = null;
  private uvBoundsLocation: WebGLUniformLocation | null = null;
  private depthOnlyLocation: WebGLUniformLocation | null = null;
  private premultiplyLocation: WebGLUniformLocation | null = null;
  private lastResult: FaceLandmarkerResult | null = null;
  private geometryKey = '';
  private allocatedBytes = 0;
  private geometryValid = false;
  private destroyed = false;

  constructor(private gl: WebGLRenderingContext | WebGL2RenderingContext, private webgl2 = false) {
    try {
      this.program = gl.createProgram();
      this.buffer = gl.createBuffer();
      this.texCoordBuffer = gl.createBuffer();
      this.indexBuffer = gl.createBuffer();
      this.texture = gl.createTexture();
      if (!this.program || !this.buffer || !this.texCoordBuffer || !this.indexBuffer || !this.texture) {
        throw new Error('3D 贴纸渲染资源创建失败');
      }
      if (webgl2) {
        this.vao = (gl as WebGL2RenderingContext).createVertexArray();
        if (!this.vao) throw new Error('3D 贴纸顶点状态创建失败');
      }
      const vertex = webgl2
        ? '#version 300 es\n' + VERTEX_SHADER.replace(/attribute /g, 'in ').replace('varying ', 'out ')
        : VERTEX_SHADER;
      const fragment = webgl2
        ? '#version 300 es\n' +
          FRAGMENT_SHADER.replace('varying ', 'in ')
            .replace('precision mediump float;', 'precision mediump float;\nout vec4 result;')
            .replace(/gl_FragColor/g, 'result')
            .replace('texture2D(', 'texture(')
        : FRAGMENT_SHADER;
      this.attachShader(gl.VERTEX_SHADER, vertex);
      this.attachShader(gl.FRAGMENT_SHADER, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program) || '3D 贴纸着色器链接失败');
      }
      this.positionLocation = gl.getAttribLocation(this.program, 'position');
      this.texCoordLocation = gl.getAttribLocation(this.program, 'texCoord');
      this.meshLocation = gl.getUniformLocation(this.program, 'mesh');
      this.uvBoundsLocation = gl.getUniformLocation(this.program, 'uvBounds');
      this.depthOnlyLocation = gl.getUniformLocation(this.program, 'depthOnly');
      this.premultiplyLocation = gl.getUniformLocation(this.program, 'premultiplyAlpha');
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program, 'image'), 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** 每个输出帧绘制；只有新的关键点、尺寸、素材或配置才重算及上传几何。 */
  public draw(sticker: FaceStickerDraw, width: number, height: number, composite: boolean): boolean {
    const gl = this.gl;
    if (this.destroyed || gl.isContextLost()) return false;
    if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return false;
    if (this.webgl2) {
      (gl as WebGL2RenderingContext).bindVertexArray(this.vao);
      (gl as WebGL2RenderingContext).bindSampler(0, null);
    }
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    this.setSource(sticker.source);
    const mesh = sticker.placement?.mode === 'mesh';
    const placement = sticker.placement;
    const key = `${width}:${height}:${sticker.fit}:${mesh}:${placement?.anchor}:${
      placement?.scale
    }:${placement?.offset?.join(',')}:${placement?.constrainToChin}`;
    if (this.lastResult !== sticker.landmarks || this.geometryKey !== key) {
      if (this.geometryKey !== key) this.meshGeometry = null;
      this.geometryValid = this.updateGeometry(sticker, width, height, mesh);
      this.lastResult = sticker.landmarks;
      this.geometryKey = key;
    }
    if (!this.geometryValid) return false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.uniform1i(this.meshLocation, mesh ? 1 : 0);
    gl.uniform1i(this.premultiplyLocation, composite ? 0 : 1);
    gl.uniform1i(this.depthOnlyLocation, 0);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.enableVertexAttribArray(this.texCoordLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.colorMask(true, true, true, true);
    if (composite) {
      gl.enable(gl.BLEND);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }
    try {
      if (mesh) {
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        const bounds = this.contentBounds!;
        gl.uniform4f(this.uvBoundsLocation, bounds.left, bounds.top, bounds.right, bounds.bottom);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        // 完整脸部先写深度，避免远侧贴纸穿过近侧透明的眼口或 contain 空白。
        gl.uniform1i(this.depthOnlyLocation, 1);
        gl.colorMask(false, false, false, false);
        gl.drawElements(gl.TRIANGLES, this.meshGeometry!.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.colorMask(true, true, true, true);
        gl.uniform1i(this.depthOnlyLocation, 0);
        gl.depthMask(false);
        gl.drawElements(gl.TRIANGLES, this.meshGeometry!.indices.length, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.disable(gl.DEPTH_TEST);
        gl.uniform4f(this.uvBoundsLocation, 0, 0, 1, 1);
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 20, 12);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return true;
    } finally {
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      if (this.webgl2) (gl as WebGL2RenderingContext).bindVertexArray(null);
    }
  }

  private setSource(source: HTMLImageElement) {
    const key = source.currentSrc || source.src || '';
    if (source === this.source && key === this.sourceKey) return;
    const gl = this.gl;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (source.naturalWidth > maxSize || source.naturalHeight > maxSize) {
      throw new Error(`3D 贴纸图片尺寸不能超过 ${maxSize} 像素`);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.source = source;
    this.sourceKey = key;
    this.contentBounds = undefined;
    this.meshGeometry = null;
    this.lastResult = null;
    this.geometryKey = '';
  }

  private updateGeometry(sticker: FaceStickerDraw, width: number, height: number, mesh: boolean) {
    const gl = this.gl;
    if ((mesh && !this.meshGeometry) || (sticker.placement?.constrainToChin && !this.contentBounds)) {
      this.contentBounds = getStickerContentBounds(sticker.source, mesh);
    }
    let vertices: Float32Array | null;
    if (mesh) {
      if (!this.meshGeometry) {
        this.meshGeometry = new FaceStickerMeshGeometry(
          sticker.source.naturalWidth / sticker.source.naturalHeight,
          sticker.fit,
          this.contentBounds!
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.meshGeometry.texCoords, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.meshGeometry.indices, gl.STATIC_DRAW);
      }
      vertices = this.meshGeometry.update(sticker.landmarks, width, height);
    } else {
      vertices = createFaceStickerVertices(
        sticker.landmarks,
        width,
        height,
        sticker.source.naturalWidth / sticker.source.naturalHeight,
        sticker.placement,
        this.contentBounds
      );
    }
    if (!vertices) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.allocatedBytes !== vertices.byteLength) {
      gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      this.allocatedBytes = vertices.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    return true;
  }

  /** 不释放借用的 context；调用方决定何时销毁其画布。 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    if (this.vao) (gl as WebGL2RenderingContext).deleteVertexArray(this.vao);
    this.program = this.buffer = this.texCoordBuffer = this.indexBuffer = this.texture = this.vao = null;
    this.source = null;
    this.lastResult = null;
    this.meshGeometry = null;
  }

  private attachShader(type: number, source: string) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('3D 贴纸着色器创建失败');
    try {
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || '3D 贴纸着色器编译失败');
      }
      gl.attachShader(this.program!, shader);
    } finally {
      gl.deleteShader(shader);
    }
  }
}
