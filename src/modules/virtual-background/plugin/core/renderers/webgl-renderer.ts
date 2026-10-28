import { VirtualType } from '../../type';
import type { FaceMotionImageReader, FrameContext, FrameRenderer, FrameRenderOptions, GpuMaskTarget } from '../types';
import { WEBGL_BASE, WEBGL_COPY, WEBGL_FACE_MOTION, WEBGL_FILTER, WEBGL_MASK_COPY, WEBGL_VERTEX } from './webgl-shaders';
import { FaceStickerDrawRenderer } from '../effects/image-sticker-3d/face-sticker-draw';

const EMPTY_FACE_UNIFORMS = new Array<number>(16).fill(0);

interface TextureSlot {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  source?: CanvasImageSource;
  sourceKey?: string;
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

/** 与 MediaPipe 共享一个 WebGL2 context；只在 callback 内借用模型纹理，跨帧仅保留自有纹理。 */
export class WebGLRenderer implements FrameRenderer {
  private readonly canvas = new OffscreenCanvas(1280, 720);
  private readonly gl: WebGL2RenderingContext;
  private readonly textures = new Map<string, TextureSlot>();
  private readonly programs = new Map<string, Program>();
  private vao: WebGLVertexArrayObject | null = null;
  private sampler: WebGLSampler | null = null;
  private maskSampler: WebGLSampler | null = null;
  private initialized = false;
  private destroyed = false;
  private outputWidth = 1280;
  private outputHeight = 720;
  private maskVersion = 0;
  private filteredMaskKey = '';
  private uploadedFrame: CanvasImageSource | null = null;
  private faceSticker: FaceStickerDrawRenderer | null = null;
  private motionReadback: Uint8Array | null = null;

  public readonly gpuMaskTarget: GpuMaskTarget;
  /** 实验首次请求才创建小图资源；返回独占的顶部起始灰度数据，不持有输入视频帧。 */
  public readonly faceMotionImageReader: FaceMotionImageReader = (frame, crop, width, height) => {
    if (
      ![frame.width, frame.height, crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
      frame.width <= 0 || frame.height <= 0 || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
      crop.x + crop.width > frame.width || crop.y + crop.height > frame.height ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 192 || height > 192
    ) return null;
    try {
      this.assertReady();
      return this.withSharedState(() => {
        const gl = this.gl;
        const video = this.uploadVideo(frame.videoFrame);
        if (!this.programs.has('faceMotion')) this.programs.set('faceMotion', this.createProgram(WEBGL_FACE_MOTION));
        const target = this.ensureTexture('faceMotion', width, height, true);
        const pixels = width * height;
        if (this.motionReadback?.length !== pixels * 4) this.motionReadback = new Uint8Array(pixels * 4);
        const packLayout = [gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
        try {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
          packLayout.forEach((parameter) => gl.pixelStorei(parameter, 0));
          this.draw('faceMotion', target, { source: video.texture }, {
            crop: [crop.x / frame.width, crop.y / frame.height, crop.width / frame.width, crop.height / frame.height]
          });
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.motionReadback);
          if (gl.isContextLost()) return null;
          const gray = new Uint8Array(pixels);
          for (let i = 0; i < pixels; i++) gray[i] = this.motionReadback[i * 4];
          return gray;
        } finally {
          // 与共享 context 的既有约定一致，回到中性状态，不增加每帧动态状态查询。
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
          packLayout.forEach((parameter) => gl.pixelStorei(parameter, 0));
        }
      });
    } catch {
      return null;
    }
  };

  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('[virtualPlugin] 无法创建共享 WebGL2 context');
    this.gl = gl;
    this.gpuMaskTarget = {
      canvas: this.canvas,
      updateMask: (texture, frame, width, height) => this.updateMask(texture, frame, width, height)
    };
  }

  public initialize(width: number, height: number) {
    this.assertAvailable();
    this.outputWidth = width;
    this.outputHeight = height;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    if (this.initialized) return;
    const gl = this.gl;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('[virtualPlugin] GPU 纹理实验需要 EXT_color_buffer_float');
    }
    try {
      this.withSharedState(() => {
        this.vao = gl.createVertexArray();
        this.sampler = gl.createSampler();
        this.maskSampler = gl.createSampler();
        if (!this.vao || !this.sampler || !this.maskSampler) throw new Error('[virtualPlugin] 无法创建 WebGL 渲染资源');
        gl.samplerParameteri(this.sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.samplerParameteri(this.sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.samplerParameteri(this.sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(this.sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(this.maskSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.samplerParameteri(this.maskSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.samplerParameteri(this.maskSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.samplerParameteri(this.maskSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        for (const [name, fragment] of Object.entries({
          base: WEBGL_BASE,
          copy: WEBGL_COPY,
          maskCopy: WEBGL_MASK_COPY,
          filter: WEBGL_FILTER
        })) {
          this.programs.set(name, this.createProgram(fragment));
        }
        const fallback = this.ensureTexture('fallback', 1, 1, false);
        gl.bindTexture(gl.TEXTURE_2D, fallback.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      });
    } catch (error) {
      this.destroy();
      throw error;
    }
    this.initialized = true;
  }

  /** callback 内完成 GPU copy，返回后不再使用 MediaPipe 拥有的 texture。 */
  private updateMask(texture: WebGLTexture, frame: FrameContext, width: number, height: number) {
    this.assertReady();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('[virtualPlugin] GPU mask 缓存尺寸无效');
    }
    this.withSharedState(() => {
      const video = this.uploadVideo(frame.videoFrame);
      const mask = this.ensureTexture('mask', width, height, true);
      const guide = this.ensureTexture('guide', width, height, true);
      // MediaPipe 的纹理 v=0 对应图像上边；copy shader 转为内部 framebuffer 的 bottom-origin。
      this.draw('maskCopy', mask, { source: texture });
      this.draw('copy', guide, { source: video.texture });
      this.maskVersion += 1;
      this.filteredMaskKey = '';
    });
  }

  public render(options: FrameRenderOptions) {
    this.assertReady();
    if (this.canvas.width !== this.outputWidth) this.canvas.width = this.outputWidth;
    if (this.canvas.height !== this.outputHeight) this.canvas.height = this.outputHeight;
    this.withSharedState(() => {
      const fallback = this.textures.get('fallback')!;
      const video = this.uploadVideo(options.videoFrame);
      this.uploadedFrame = null;
      let mask = this.textures.get('mask') ?? fallback;
      const hasMask = !!options.gpuMask && this.maskVersion > 0;
      if (hasMask && options.maskBlur > 0) mask = this.prepareMask(mask, options.maskBlur);
      let background = options.backgroundSource ? this.uploadSource('background', options.backgroundSource) : fallback;
      if (options.baseMode === 'segmented' && hasMask && options.backgroundOptions.type === VirtualType.BLUR) {
        background = this.prepareBlur(video, mask, options.backgroundOptions.level ?? 10);
      }
      const guide = this.textures.get('guide') ?? fallback;
      let mode = this.backgroundMode(options.backgroundOptions.type);
      let color = this.parseColor(options.backgroundOptions.color || '#ffffff');
      if (options.baseMode === 'video' || (options.baseMode === 'segmented' && !hasMask)) mode = 0;
      else if (options.baseMode === 'transparent') mode = 4;
      else if (options.baseMode === 'background' && options.backgroundOptions.type === VirtualType.BLUR) {
        mode = 1;
        color = [1, 1, 1, 1];
      }
      const useMask = options.baseMode === 'segmented' && hasMask;
      const whiteningReady = hasMask && (options.beauty?.whitening ?? 0) > 0;
      this.draw(
        'base',
        null,
        {
          video: video.texture,
          mask: mask.texture,
          background: background.texture,
          guide: guide.texture
        },
        {
          color,
          beauty: [
            options.beauty?.brightness ?? 0,
            whiteningReady ? options.beauty?.whitening ?? 0 : 0,
            options.beauty?.faceStrength ?? 0,
            2
          ],
          skinParams: [0, 0, 0, 0],
          'faceRects[0]': options.beauty?.faceRects ?? EMPTY_FACE_UNIFORMS,
          'faceEyes[0]': options.beauty?.faceEyes ?? EMPTY_FACE_UNIFORMS,
          'faceMouths[0]': options.beauty?.faceMouths ?? EMPTY_FACE_UNIFORMS,
          params: [mode, useMask ? 1 : 0, useMask && options.edgeRefinement ? 1 : 0, 0]
        }
      );
      if (options.overlaySource && options.overlayRects?.length) {
        const overlay = this.uploadSource('overlay', options.overlaySource);
        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        for (const rect of options.overlayRects) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          this.draw('copy', null, { source: overlay.texture }, {}, [
            rect.x / this.outputWidth,
            1 - (rect.y + rect.height) / this.outputHeight,
            rect.width / this.outputWidth,
            rect.height / this.outputHeight
          ]);
        }
      }
      if (options.faceSticker) {
        this.faceSticker ??= new FaceStickerDrawRenderer(this.gl, true);
        this.faceSticker.draw(options.faceSticker, this.outputWidth, this.outputHeight, true);
      }
      // GPU 指令顺序保证后续 VideoFrame(canvas) 读取完整结果，无 finish/readPixels 同步点。
      this.gl.flush();
    });
  }

  public getCanvas() {
    return this.canvas;
  }

  /** context 也被 MediaPipe 持有，因此这里只删除自有对象，不主动 loseContext。 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    this.faceSticker?.destroy();
    this.faceSticker = null;
    for (const slot of this.textures.values()) {
      gl.deleteTexture(slot.texture);
      if (slot.framebuffer) gl.deleteFramebuffer(slot.framebuffer);
    }
    for (const program of this.programs.values()) gl.deleteProgram(program.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.sampler) gl.deleteSampler(this.sampler);
    if (this.maskSampler) gl.deleteSampler(this.maskSampler);
    this.textures.clear();
    this.programs.clear();
    this.uploadedFrame = null;
    this.motionReadback = null;
    this.vao = null;
    this.sampler = null;
    this.maskSampler = null;
    this.maskVersion = 0;
    this.initialized = false;
  }

  private prepareMask(mask: TextureSlot, radius: number) {
    const key = `${this.maskVersion}:${mask.width}:${mask.height}:${this.outputWidth}:${this.outputHeight}:${radius}`;
    if (key === this.filteredMaskKey) return this.textures.get('maskFiltered')!;
    const horizontal = this.ensureTexture('maskHorizontal', mask.width, mask.height, true);
    const filtered = this.ensureTexture('maskFiltered', mask.width, mask.height, true);
    const step = Math.max(radius / 4, 0.5);
    this.draw(
      'filter',
      horizontal,
      { source: mask.texture, mask: mask.texture },
      {
        params: [step / this.outputWidth, 0, 0, 32]
      }
    );
    this.draw(
      'filter',
      filtered,
      { source: horizontal.texture, mask: mask.texture },
      {
        params: [0, step / this.outputHeight, 0, 32]
      }
    );
    this.filteredMaskKey = key;
    return filtered;
  }

  private prepareBlur(video: TextureSlot, mask: TextureSlot, radius: number) {
    const width = Math.min(320, this.outputWidth);
    const height = Math.max(1, Math.round((this.outputHeight * width) / this.outputWidth));
    const horizontal = this.ensureTexture('blurHorizontal', width, height, true, true);
    const filtered = this.ensureTexture('blurFiltered', width, height, true, true);
    const step = Math.max(radius, 1) / 4;
    this.draw(
      'filter',
      horizontal,
      { source: video.texture, mask: mask.texture },
      {
        params: [step / this.outputWidth, 0, 1, 18]
      }
    );
    this.draw(
      'filter',
      filtered,
      { source: horizontal.texture, mask: mask.texture },
      {
        params: [0, step / this.outputHeight, 2, 18]
      }
    );
    return filtered;
  }

  private uploadVideo(source: CanvasImageSource) {
    if (this.uploadedFrame === source) return this.textures.get('video')!;
    const video = this.uploadSource('video', source);
    this.uploadedFrame = source;
    return video;
  }

  private uploadSource(name: string, source: CanvasImageSource) {
    const dimensions = source as unknown as {
      displayWidth?: number;
      displayHeight?: number;
      videoWidth?: number;
      videoHeight?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      width?: number;
      height?: number;
    };
    const width = dimensions.displayWidth || dimensions.videoWidth || dimensions.naturalWidth || dimensions.width;
    const height = dimensions.displayHeight || dimensions.videoHeight || dimensions.naturalHeight || dimensions.height;
    if (!width || !height) throw new Error('[virtualPlugin] WebGL 素材尺寸无效');
    const slot = this.ensureTexture(name, width, height, false);
    const image = typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement ? source : null;
    const key = image?.currentSrc || image?.src;
    if (image && slot.source === source && slot.sourceKey === key) return slot;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    // DOM 与 VideoFrame 统一保持上传方向，在采样 shader 中翻转，避免 VideoFrame 忽略 UNPACK_FLIP_Y。
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    slot.source = image ? source : undefined;
    slot.sourceKey = key;
    return slot;
  }

  private ensureTexture(
    name: string,
    width: number,
    height: number,
    renderTarget: boolean,
    floating = false
  ): TextureSlot {
    const previous = this.textures.get(name);
    if (previous?.width === width && previous.height === height) return previous;
    const gl = this.gl;
    if (previous) {
      gl.deleteTexture(previous.texture);
      if (previous.framebuffer) gl.deleteFramebuffer(previous.framebuffer);
      this.textures.delete(name);
    }
    const texture = gl.createTexture();
    if (!texture) throw new Error('[virtualPlugin] 无法创建 WebGL texture');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, floating ? gl.RGBA16F : gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = renderTarget ? gl.createFramebuffer() : null;
    if (renderTarget) {
      if (!framebuffer) {
        gl.deleteTexture(texture);
        throw new Error('[virtualPlugin] 无法创建 WebGL framebuffer');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        throw new Error('[virtualPlugin] WebGL framebuffer 不完整');
      }
    }
    const slot = { texture, framebuffer, width, height };
    this.textures.set(name, slot);
    return slot;
  }

  private draw(
    name: string,
    target: TextureSlot | null,
    textures: Record<string, WebGLTexture>,
    uniforms: Record<string, number[]> = {},
    rect = [0, 0, 1, 1]
  ) {
    const gl = this.gl;
    const program = this.programs.get(name)!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? this.outputWidth, target?.height ?? this.outputHeight);
    gl.bindVertexArray(this.vao);
    gl.useProgram(program.program);
    gl.uniform4fv(this.uniform(program, 'rect'), rect);
    let unit = 0;
    for (const [key, texture] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // texelFetch 的模型纹理不要求 float linear support；nearest sampler 避免完整性校验依赖其参数。
      gl.bindSampler(unit, name === 'maskCopy' ? this.maskSampler : this.sampler);
      gl.uniform1i(this.uniform(program, key), unit++);
    }
    for (const [key, values] of Object.entries(uniforms)) gl.uniform4fv(this.uniform(program, key), values);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private uniform(program: Program, name: string) {
    if (!program.uniforms.has(name)) program.uniforms.set(name, this.gl.getUniformLocation(program.program, name));
    return program.uniforms.get(name)!;
  }

  private createProgram(fragment: string): Program {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    if (!program) throw new Error('[virtualPlugin] 无法创建 WebGL program');
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, WEBGL_VERTEX],
        [gl.FRAGMENT_SHADER, fragment]
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('[virtualPlugin] 无法创建 WebGL shader');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(`[virtualPlugin] WebGL shader 编译失败：${gl.getShaderInfoLog(shader)}`);
        }
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`[virtualPlugin] WebGL program 链接失败：${gl.getProgramInfoLog(program)}`);
      }
      return { program, uniforms: new Map() };
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  private assertAvailable() {
    if (this.destroyed) throw new Error('[virtualPlugin] WebGL renderer 已销毁');
    if (this.gl.isContextLost()) throw new Error('[virtualPlugin] 共享 WebGL context 已丢失');
  }

  private assertReady() {
    this.assertAvailable();
    if (!this.initialized) throw new Error('[virtualPlugin] WebGL renderer 尚未初始化');
  }

  /**
   * 此 context 专供本实例与独占的 MediaPipe 模型使用，不接受任意第三方 GL 绘制。
   * MediaPipe DrawingUtils/MPImageShaderContext 同样显式绑定自身 program/VAO，结束后解除绑定。
   * 遵循该边界：设置本次所需状态，finally 回到中性状态；不扫描或承诺恢复任意外部状态。
   * 避免每帧 getParameter/isEnabled 查询造成浏览器与 GPU 服务之间的同步等待。
   */
  private withSharedState<T>(operation: () => T): T {
    const gl = this.gl;
    const capabilities = [
      gl.BLEND,
      gl.DEPTH_TEST,
      gl.STENCIL_TEST,
      gl.SCISSOR_TEST,
      gl.CULL_FACE,
      gl.RASTERIZER_DISCARD
    ];
    const unpackLayout = [
      gl.UNPACK_ROW_LENGTH,
      gl.UNPACK_SKIP_PIXELS,
      gl.UNPACK_SKIP_ROWS,
      gl.UNPACK_IMAGE_HEIGHT,
      gl.UNPACK_SKIP_IMAGES
    ];
    try {
      capabilities.forEach((capability) => gl.disable(capability));
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      unpackLayout.forEach((parameter) => gl.pixelStorei(parameter, 0));
      return operation();
    } finally {
      gl.useProgram(null);
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.clearDepth(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
      unpackLayout.forEach((parameter) => gl.pixelStorei(parameter, 0));
      capabilities.forEach((capability) => gl.disable(capability));
      for (let unit = 0; unit < 5; unit++) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindSampler(unit, null);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  private backgroundMode(type: VirtualType) {
    if (type === VirtualType.IMAGE || type === VirtualType.VIDEO || type === VirtualType.STREAM) return 2;
    return type === VirtualType.BLUR ? 3 : 1;
  }

  private parseColor(value: string): number[] {
    const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value.trim());
    const long = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(value.trim());
    const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value.trim());
    if (short)
      return [
        parseInt(short[1] + short[1], 16) / 255,
        parseInt(short[2] + short[2], 16) / 255,
        parseInt(short[3] + short[3], 16) / 255,
        1
      ];
    if (long)
      return [
        parseInt(long[1], 16) / 255,
        parseInt(long[2], 16) / 255,
        parseInt(long[3], 16) / 255,
        long[4] ? parseInt(long[4], 16) / 255 : 1
      ];
    if (rgba)
      return [
        Number(rgba[1]) / 255,
        Number(rgba[2]) / 255,
        Number(rgba[3]) / 255,
        rgba[4] === undefined ? 1 : Number(rgba[4])
      ];
    return [1, 1, 1, 1];
  }
}
