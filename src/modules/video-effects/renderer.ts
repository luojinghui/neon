import { createFaceTexture, FACE_TRIANGLES, FACE_UV } from './faceMesh';
import type { InferenceResult } from './inference';
import type { VideoEffectsSettings } from './types';

const VERTEX = `#version 300 es
out vec2 uv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=vec2(p.x,1.-p.y); gl_Position=vec4(p*2.-1.,0.,1.); }`;
const PHOTO = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D photo,mask,backdrop;
uniform vec2 pixel;
uniform vec4 faceArea;
uniform float whitening,smoothing;
uniform int background;
uniform bool hasMask;
void main(){
  vec3 original=texture(photo,uv).rgb, processed=original;
  if(whitening>0. || smoothing>0.) {
    float skin=(1.-smoothstep(.65,1.,length((uv-faceArea.xy)/max(faceArea.zw,vec2(.001)))));
    // Preserve dark facial features and apply beauty only inside the tracked face.
    skin*=smoothstep(.07,.23,dot(original,vec3(.299,.587,.114)));
    if(smoothing>0. && skin>0.) {
      vec3 sum=original; float weights=1.;
      for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) {
        vec3 c=texture(photo,uv+vec2(x,y)*pixel*2.).rgb;
        float w=exp(-dot(c-original,c-original)*45.); sum+=c*w; weights+=w;
      }
      processed=mix(original,sum/weights,smoothing*.65*skin);
    }
    if(whitening>0.) processed=mix(processed,pow(max(processed,vec3(0.)),vec3(.78)),whitening*.6*skin);
  }
  if(background>0 && hasMask) {
    vec3 bg;
    if(background==1) bg=mix(vec3(1.,.77,.79),vec3(1.,.95,.81),uv.y);
    else if(background==2) {
      bg=mix(vec3(.045,.06,.15),vec3(.24,.17,.39),uv.y);
      vec2 grid=uv*vec2(80.,60.); vec2 cell=floor(grid);
      float star=step(.985,fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453));
      bg+=star*(1.-smoothstep(.04,.14,length(fract(grid)-.5)))*.65;
    } else if(background==3) bg=mix(vec3(.53,.86,.78),vec3(.85,.97,.86),uv.y);
    else bg=texture(backdrop,uv).rgb;
    float confidence=texture(mask,uv).r;
    // Small edge-aware refinement, with no temporal mask blending/trailing silhouettes.
    vec2 stepSize=1./vec2(textureSize(mask,0)); float total=1.;
    for(int i=0;i<4;i++) {
      vec2 d=(i==0?vec2(1,0):i==1?vec2(-1,0):i==2?vec2(0,1):vec2(0,-1))*stepSize;
      vec3 delta=texture(photo,uv+d).rgb-original; float w=exp(-dot(delta,delta)*60.)*.4;
      confidence+=texture(mask,uv+d).r*w; total+=w;
    }
    processed=mix(bg,processed,smoothstep(.18,.82,confidence/total));
  }
  color=vec4(processed,1.);
}`;
const OVERLAY_VERTEX = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec2 texCoord;
out vec2 uv; out vec3 surface;
void main(){ gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,clamp(position.z,-.99,.99),1.); surface=position; uv=texCoord; }`;
const OVERLAY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv; in vec3 surface; out vec4 color;
uniform sampler2D image; uniform bool mesh;
void main(){
  color=texture(image,uv);
  if(mesh) { vec3 n=normalize(cross(dFdx(surface),dFdy(surface))); float light=.88+.12*abs(n.z); color.rgb*=light; }
}`;

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const shaders: WebGLShader[] = [];
  const result = gl.createProgram()!;
  try {
    for (const [index, source] of [vertex, fragment].entries()) {
      const shader = gl.createShader(index ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER)!; shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || '画面着色器不可用');
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error('画面渲染初始化失败');
    return result;
  } catch (error) { gl.deleteProgram(result); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
}

/** Direct video → GPU → captureStream; no full-size 2D canvas round trips. */
export class CallRenderer {
  readonly canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext;
  private photoProgram: WebGLProgram;
  private overlayProgram: WebGLProgram;
  private photo: WebGLTexture;
  private mask: WebGLTexture;
  private blank: WebGLTexture;
  private assets = new Map<string, WebGLTexture>();
  private quad: WebGLVertexArrayObject;
  private mesh: WebGLVertexArrayObject;
  private sticker: WebGLVertexArrayObject;
  private positions: WebGLBuffer;
  private stickerBuffer: WebGLBuffer;
  private buffers: WebGLBuffer[] = [];
  private locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private meshPositions = new Float32Array(468 * 3);
  private stickerVertices = new Float32Array(30);
  private maskWidth = 0;
  private maskHeight = 0;
  private maskTime = -Infinity;

  constructor(width: number, height: number) {
    this.canvas.width = width; this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('此浏览器暂不支持画面效果');
    this.gl = gl;
    this.photoProgram = program(gl, VERTEX, PHOTO); this.overlayProgram = program(gl, OVERLAY_VERTEX, OVERLAY_FRAGMENT);
    this.photo = this.texture(); this.mask = this.texture(); this.blank = this.texture();
    this.quad = gl.createVertexArray()!;
    this.mesh = gl.createVertexArray()!; gl.bindVertexArray(this.mesh);
    this.positions = this.buffer();
    gl.bufferData(gl.ARRAY_BUFFER, this.meshPositions.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.buffer(); gl.bufferData(gl.ARRAY_BUFFER, FACE_UV, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    const indices = gl.createBuffer()!; this.buffers.push(indices); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, FACE_TRIANGLES, gl.STATIC_DRAW);
    this.sticker = gl.createVertexArray()!; gl.bindVertexArray(this.sticker); this.stickerBuffer = this.buffer();
    gl.bufferData(gl.ARRAY_BUFFER, this.stickerVertices.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
  }
  private buffer() { const buffer = this.gl.createBuffer()!; this.buffers.push(buffer); this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer); return buffer; }
  private texture() {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return texture;
  }
  private uniform(program: WebGLProgram, name: string) {
    if (!this.locations.has(program)) this.locations.set(program, new Map());
    const locations = this.locations.get(program)!;
    if (!locations.has(name)) locations.set(name, this.gl.getUniformLocation(program, name));
    return locations.get(name)!;
  }
  private bind(program: WebGLProgram, name: string, texture: WebGLTexture, unit: number) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(this.uniform(program, name), unit);
  }
  hasAsset(name: string) { return this.assets.has(name); }
  setAsset(name: string, source: TexImageSource) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0);
    const texture = this.assets.get(name) || this.texture();
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); this.assets.set(name, texture);
  }
  updateMask(mask: NonNullable<InferenceResult['mask']>, timestamp: number) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mask); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.maskWidth !== mask.width || this.maskHeight !== mask.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.width, mask.height, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
      this.maskWidth = mask.width; this.maskHeight = mask.height;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mask.width, mask.height, gl.RED, gl.UNSIGNED_BYTE, mask.data);
    this.maskTime = timestamp;
  }
  clearMask() { this.maskTime = -Infinity; }

  render(video: HTMLVideoElement, settings: VideoEffectsSettings, face: Float32Array, now: number) {
    const gl = this.gl, p = this.photoProgram;
    if (gl.isContextLost()) throw new Error('画面渲染已中断，请重试');
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(p); gl.bindVertexArray(this.quad);
    this.bind(p, 'photo', this.photo, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    this.bind(p, 'mask', this.mask, 1); this.bind(p, 'backdrop', this.assets.get(settings.background) || this.blank, 2);
    gl.uniform2f(this.uniform(p, 'pixel'), 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1f(this.uniform(p, 'whitening'), settings.whitening / 100); gl.uniform1f(this.uniform(p, 'smoothing'), settings.smoothing / 100);
    gl.uniform1i(this.uniform(p, 'background'), ['original', 'peach', 'cosmos', 'mint', 'sunroom', 'hills', 'grid'].indexOf(settings.background));
    gl.uniform1i(this.uniform(p, 'hasMask'), now - this.maskTime < 250 ? 1 : 0);
    const x = (id: number) => face[id * 3], y = (id: number) => face[id * 3 + 1];
    gl.uniform4f(this.uniform(p, 'faceArea'), face.length ? (x(234) + x(454)) / 2 : -1, face.length ? (y(10) + y(152)) / 2 : -1, face.length ? Math.abs(x(454) - x(234)) * .52 : 0, face.length ? Math.abs(y(152) - y(10)) * .52 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (face.length < 468 * 3) return;
    gl.useProgram(this.overlayProgram); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (settings.faceEffect !== 'none') {
      const key = `mesh-${settings.faceEffect}`;
      if (!this.assets.has(key)) this.setAsset(key, createFaceTexture(settings.faceEffect));
      this.bind(this.overlayProgram, 'image', this.assets.get(key)!, 0); gl.uniform1i(this.uniform(this.overlayProgram, 'mesh'), 1);
      gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      this.meshPositions.set(face.subarray(0, 468 * 3));
      gl.bindVertexArray(this.mesh); gl.bindBuffer(gl.ARRAY_BUFFER, this.positions); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.meshPositions);
      gl.drawElements(gl.TRIANGLES, FACE_TRIANGLES.length, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.DEPTH_TEST);
    }
    const sticker = this.assets.get(settings.sticker2d);
    if (sticker) {
      const width = this.canvas.width, height = this.canvas.height;
      const size = Math.hypot((x(454) - x(234)) * width, (y(454) - y(234)) * height);
      const angle = Math.atan2((y(263) - y(33)) * height, (x(263) - x(33)) * width), cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = (x(33) + x(263)) * width / 2, cy = (y(33) + y(263)) * height / 2 + size * .2;
      [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]].forEach(([u, v], i) => {
        const px = (u - .5) * size * 1.1, py = (v - .5) * size * 1.1 * 140 / 360;
        this.stickerVertices.set([(cx + px * cos - py * sin) / width, (cy + px * sin + py * cos) / height, 0, u, v], i * 5);
      });
      this.bind(this.overlayProgram, 'image', sticker, 0); gl.uniform1i(this.uniform(this.overlayProgram, 'mesh'), 0);
      gl.bindVertexArray(this.sticker); gl.bindBuffer(gl.ARRAY_BUFFER, this.stickerBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.stickerVertices); gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.BLEND);
  }
  dispose() {
    const gl = this.gl;
    [this.photoProgram, this.overlayProgram].forEach(p => gl.deleteProgram(p));
    [this.photo, this.mask, this.blank, ...this.assets.values()].forEach(t => gl.deleteTexture(t)); this.assets.clear();
    [this.quad, this.mesh, this.sticker].forEach(v => gl.deleteVertexArray(v)); this.buffers.forEach(b => gl.deleteBuffer(b));
    gl.getExtension('WEBGL_lose_context')?.loseContext(); this.canvas.width = this.canvas.height = 0;
  }
}
