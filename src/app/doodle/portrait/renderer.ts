import type { ImageSegmenterResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { PortraitSettings } from './settings';
import { layoutCartoonStickers, loadCartoonImages, type CartoonAsset } from './cartoonStickers';

const QUAD = `#version 300 es
out vec2 uv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const MASK = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D bodyMask,faceMask,backgroundMask;
void main(){ color=vec4(clamp(texture(bodyMask,uv).r+texture(faceMask,uv).r,0.,1.),1.-texture(backgroundMask,uv).r,0.,1.); }`;
const PHOTO = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D photo,mask,backdropImage;
uniform bool hasBackdropImage;
uniform vec2 size;
uniform float viewZoom;
uniform vec2 viewOffset;
uniform float whitening,smoothing,cartoon,outline;
uniform int background,exclusionCount;
uniform vec4 exclusions[9];
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float personAt(vec2 p){ return texture(mask,p).g*step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.); }
void main(){
  vec2 framed=((uv*2.-1.-viewOffset)/viewZoom+1.)*.5;
  vec2 p=vec2(framed.x,1.-framed.y), pixel=1./size;
  float inside=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
  vec3 original=texture(photo,p).rgb;
  vec2 m=texture(mask,p).rg*inside;
  float skin=smoothstep(.25,.8,m.r);
  for(int i=0;i<9;i++) { if(i>=exclusionCount) break; vec4 e=exclusions[i]; skin*=smoothstep(.8,1.25,length((p-e.xy)/max(e.zw,vec2(.001)))); }
  vec3 smoothColor=original; float weights=1.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) {
    vec3 sampleColor=texture(photo,p+vec2(x,y)*pixel*2.).rgb;
    float w=exp(-dot(sampleColor-original,sampleColor-original)*40.);
    smoothColor+=sampleColor*w; weights+=w;
  }
  vec3 skinColor=mix(original,smoothColor/weights,smoothing*.65);
  skinColor=mix(skinColor,pow(max(skinColor,vec3(0.)),vec3(.74)),whitening*.7);
  vec3 processed=mix(original,skinColor,skin);
  vec3 quantized=floor(processed*12.+.5)/12.;
  float edge=length(texture(photo,p+vec2(pixel.x,0.)).rgb-texture(photo,p-vec2(pixel.x,0.)).rgb)+length(texture(photo,p+vec2(0.,pixel.y)).rgb-texture(photo,p-vec2(0.,pixel.y)).rgb);
  processed=mix(processed,quantized*(1.-smoothstep(.12,.6,edge)*.5),cartoon*.75);
  vec3 backdrop=mix(vec3(.96,.94,.90),vec3(.87,.89,.92),clamp(p.y,0.,1.));
  if(background==1) backdrop=mix(vec3(1.,.77,.79),vec3(1.,.95,.81),p.y);
  if(background==2) { backdrop=mix(vec3(.12,.10,.25),vec3(.38,.26,.58),p.y); vec2 cell=floor(p*vec2(75.,100.)); backdrop+=step(.985,hash(cell))*smoothstep(.15,0.,length(fract(p*vec2(75.,100.))-.5))*.7; }
  if(background==3) backdrop=mix(vec3(.53,.86,.78),vec3(.85,.97,.86),p.y);
  if(hasBackdropImage) backdrop=texture(backdropImage,p).rgb;
  processed=mix(backdrop,processed,(background!=0 || hasBackdropImage) ? smoothstep(.2,.85,m.g) : inside);
  float outer=0.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) outer=max(outer,personAt(p+vec2(x,y)*pixel*(2.+outline*5.)));
  processed=mix(processed,vec3(1.,.96,.87),max(0.,outer-m.g)*outline*.85);
  color=vec4(clamp(processed,0.,1.),1.);
}`;
const STICKER_VERTEX = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec2 texCoord;
uniform vec2 viewOffset; uniform float viewZoom;
out vec2 uv;
void main(){ gl_Position=vec4(position.xy*viewZoom+viewOffset,position.z,1.); uv=texCoord; }`;
const STICKER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D sticker;
uniform float opacity,accent;
uniform vec3 accentColor;
void main(){
  vec4 image=texture(sticker,uv);
  vec2 pixel=1./vec2(textureSize(sticker,0));
  float border=0.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) border=max(border,texture(sticker,uv+vec2(x,y)*pixel*1.5).a);
  vec3 tone=mix(image.rgb,accentColor*mix(.55,1.,dot(image.rgb,vec3(.299,.587,.114))),accent*.65);
  float alpha=max(image.a,border);
  color=vec4(mix(vec3(1.,.98,.95),tone,image.a/max(alpha,.001)),alpha*opacity);
}`;

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const shaders = [vertex, fragment].map((source, i) => {
    const shader = gl.createShader(i === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error || 'Shader failed'); }
    return shader;
  });
  const result = gl.createProgram()!;
  shaders.forEach(shader => gl.attachShader(result, shader)); gl.linkProgram(result);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) { gl.deleteProgram(result); throw new Error('人像渲染初始化失败'); }
  return result;
}

export class PortraitRenderer {
  readonly canvas = document.createElement('canvas');
  readonly gl: WebGL2RenderingContext;
  private photoProgram: WebGLProgram;
  private maskProgram: WebGLProgram;
  private stickerProgram: WebGLProgram;
  private photo: WebGLTexture;
  private mask: WebGLTexture;
  private backdrop: WebGLTexture;
  private hasBackdrop = false;
  private fbo: WebGLFramebuffer;
  private quad: WebGLVertexArrayObject;
  private stickerQuad: WebGLVertexArrayObject;
  private stickerBuffer: WebGLBuffer;
  private stickerTextures = new Map<CartoonAsset, WebGLTexture>();
  private disposed = false;
  faces: NormalizedLandmark[][] = [];
  segmented = false;
  readonly width: number;
  readonly height: number;

  constructor(source: HTMLCanvasElement) {
    this.width = this.canvas.width = source.width;
    this.height = this.canvas.height = source.height;
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('此设备不支持人像特效，已保留原图');
    this.gl = gl;
    this.photoProgram = program(gl, QUAD, PHOTO);
    this.maskProgram = program(gl, QUAD, MASK);
    this.stickerProgram = program(gl, STICKER_VERTEX, STICKER_FRAGMENT);
    this.quad = gl.createVertexArray()!;
    this.photo = this.texture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.mask = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 255, 0, 255]));
    this.backdrop = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.fbo = gl.createFramebuffer()!;
    this.stickerQuad = gl.createVertexArray()!;
    this.stickerBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.stickerQuad); gl.bindBuffer(gl.ARRAY_BUFFER, this.stickerBuffer);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
  }

  private texture() {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  private bindTexture(program: WebGLProgram, name: string, texture: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }

  /** Consume borrowed MediaPipe textures in its callback; keep only our GPU copy. */
  captureMask(result: ImageSegmenterResult) {
    const masks = result.confidenceMasks;
    if (!masks || masks.length < 4) return;
    const gl = this.gl;
    const textures = [masks[2], masks[3], masks[0]].map(mask => {
      if (mask.canvas !== this.canvas) throw new Error('Segmentation context mismatch');
      return mask.getAsWebGLTexture();
    });
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, masks[0].width, masks[0].height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mask, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Mask framebuffer unavailable');
    gl.viewport(0, 0, masks[0].width, masks[0].height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.useProgram(this.maskProgram); gl.bindVertexArray(this.quad);
    ['bodyMask', 'faceMask', 'backgroundMask'].forEach((name, i) => this.bindTexture(this.maskProgram, name, textures[i], i));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.segmented = true;
  }

  /** Live sources reuse the same textures and programs; static portrait behavior is unchanged. */
  updateSource(source: HTMLVideoElement | HTMLCanvasElement) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.photo);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  updateFaces(faces: NormalizedLandmark[][]) { this.faces = faces; }

  async prepareStickers() {
    const images = await loadCartoonImages();
    if (this.disposed) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    for (const [asset, image] of images) {
      if (this.stickerTextures.has(asset)) continue;
      const texture = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.stickerTextures.set(asset, texture);
    }
  }

  setBackdrop(source: HTMLImageElement | null) {
    this.hasBackdrop = Boolean(source);
    if (!source) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.backdrop);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  render(settings: PortraitSettings, autoFrame = true) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) throw new Error('人像渲染已中断，请重新选择照片');
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) { this.canvas.width = this.width; this.canvas.height = this.height; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true); gl.depthMask(true);
    const face = this.faces[Math.min(this.faces.length - 1, Math.floor(settings.faceIndex))];
    const sticker = face ? layoutCartoonStickers(face, settings, this.width / this.height, autoFrame) : null;
    const view = sticker?.view || { zoom: 1, offset: [0, 0] };
    gl.useProgram(this.photoProgram); gl.bindVertexArray(this.quad);
    gl.uniform1f(gl.getUniformLocation(this.photoProgram, 'viewZoom'), view.zoom);
    gl.uniform2f(gl.getUniformLocation(this.photoProgram, 'viewOffset'), view.offset[0], view.offset[1]);
    this.bindTexture(this.photoProgram, 'photo', this.photo, 0); this.bindTexture(this.photoProgram, 'mask', this.mask, 1);
    this.bindTexture(this.photoProgram, 'backdropImage', this.backdrop, 2);
    gl.uniform1i(gl.getUniformLocation(this.photoProgram, 'hasBackdropImage'), this.hasBackdrop && this.segmented ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(this.photoProgram, 'size'), this.width, this.height);
    for (const key of ['whitening', 'smoothing', 'cartoon', 'outline'] as const) gl.uniform1f(gl.getUniformLocation(this.photoProgram, key), settings[key] / 100);
    gl.uniform1i(gl.getUniformLocation(this.photoProgram, 'background'), this.segmented ? ['original', 'peach', 'cosmos', 'mint'].indexOf(settings.background) : 0);
    const exclusions = new Float32Array(36);
    let count = 0;
    for (const face of this.faces.slice(0, 3)) for (const indices of [[33, 133, 159, 145], [362, 263, 386, 374], [61, 291, 0, 17]]) {
      const points = indices.map(i => face[i]);
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      exclusions.set([(left + right) / 2, (top + bottom) / 2, (right - left) * .65, (bottom - top) * .8], count++ * 4);
    }
    gl.uniform1i(gl.getUniformLocation(this.photoProgram, 'exclusionCount'), count);
    gl.uniform4fv(gl.getUniformLocation(this.photoProgram, 'exclusions[0]'), exclusions);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (sticker) this.drawStickers(sticker, settings);
    return this.canvas;
  }

  private drawStickers(layout: ReturnType<typeof layoutCartoonStickers>, settings: PortraitSettings) {
    const gl = this.gl;
    gl.useProgram(this.stickerProgram); gl.bindVertexArray(this.stickerQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stickerBuffer);
    gl.uniform1f(gl.getUniformLocation(this.stickerProgram, 'viewZoom'), layout.view.zoom);
    gl.uniform2f(gl.getUniformLocation(this.stickerProgram, 'viewOffset'), layout.view.offset[0], layout.view.offset[1]);
    const tone = [1, 3, 5].map(index => parseInt(settings.stickerColor.slice(index, index + 2), 16) / 255);
    gl.uniform3f(gl.getUniformLocation(this.stickerProgram, 'accentColor'), tone[0], tone[1], tone[2]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const layer of layout.layers) {
      const texture = this.stickerTextures.get(layer.asset);
      if (!texture || layer.opacity <= 0) continue;
      this.bindTexture(this.stickerProgram, 'sticker', texture, 0);
      gl.uniform1f(gl.getUniformLocation(this.stickerProgram, 'opacity'), layer.opacity);
      gl.uniform1f(gl.getUniformLocation(this.stickerProgram, 'accent'), layer.accent ? 1 : 0);
      gl.bufferData(gl.ARRAY_BUFFER, layer.vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.BLEND);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    [this.photoProgram, this.maskProgram, this.stickerProgram].forEach(p => gl.deleteProgram(p));
    [this.photo, this.mask, this.backdrop, ...this.stickerTextures.values()].forEach(t => gl.deleteTexture(t));
    this.stickerTextures.clear();
    gl.deleteFramebuffer(this.fbo); gl.deleteVertexArray(this.quad);
    gl.deleteBuffer(this.stickerBuffer); gl.deleteVertexArray(this.stickerQuad);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
