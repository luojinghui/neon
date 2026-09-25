import type { ImageSegmenterResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { buildSticker, cross, normalize } from './meshes';
import type { PortraitSettings } from './settings';
import { fitPortraitFrame } from './framing';
import { buildFaceMesh } from './faceMesh';

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
uniform sampler2D photo,mask;
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
  processed=mix(backdrop,processed,background!=0 ? smoothstep(.2,.85,m.g) : inside);
  float outer=0.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) outer=max(outer,personAt(p+vec2(x,y)*pixel*(2.+outline*5.)));
  processed=mix(processed,vec3(1.,.96,.87),max(0.,outer-m.g)*outline*.85);
  color=vec4(clamp(processed,0.,1.),1.);
}`;
const MESH_VERTEX = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 tone;
uniform mat3 basis;
uniform vec2 origin,scale;
uniform vec2 viewOffset;
uniform float viewZoom;
uniform float angle,offsetY;
out vec3 n; out vec3 rgb;
void main(){
  float c=cos(angle),s=sin(angle);
  mat3 turn=mat3(c,s,0.,-s,c,0.,0.,0.,1.);
  vec3 p=basis*(turn*position+vec3(0.,offsetY,0.));
  gl_Position=vec4((origin+p.xy*scale)*viewZoom+viewOffset,-p.z*.12,1.);
  n=basis*turn*normal; rgb=tone;
}`;
const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 n; in vec3 rgb; out vec4 color;
uniform float opacity;
void main(){ vec3 normal=normalize(n); float diffuse=abs(dot(normal,normalize(vec3(-.4,.65,1.)))); float shine=pow(max(0.,dot(normal,normalize(vec3(-.3,.4,1.)))),28.); color=vec4(rgb*(.70+diffuse*.30)+shine*.12,opacity); }`;
const FACE_VERTEX = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 faceUv;
uniform vec2 viewOffset; uniform float viewZoom;
out vec3 n; out vec2 p;
void main(){ gl_Position=vec4(position.xy*viewZoom+viewOffset,-position.z*.12,1.); n=normal; p=faceUv; }`;
const FACE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 n; in vec2 p; out vec4 color;
uniform int character; uniform float opacity; uniform vec4 features[3];
float oval(vec2 center,vec2 radii){ return 1.-smoothstep(.88,1.08,length((p-center)/radii)); }
float line(vec2 a,vec2 b,float width){ vec2 delta=b-a; float t=clamp(dot(p-a,delta)/dot(delta,delta),0.,1.); return 1.-smoothstep(width,width+.006,length(p-a-t*delta)); }
void main(){
  vec3 cream=vec3(1.,.97,.88),ink=vec3(.13,.12,.18),pink=vec3(1.,.55,.65);
  vec3 base=cream;
  if(character==1){
    base=vec3(1.,.82,.48);
    base=mix(base,cream,oval(vec2(0.,-.18),vec2(.34,.27)));
    for(int i=-1;i<=1;i++) base=mix(base,vec3(.65,.34,.15),oval(vec2(float(i)*.095,.36),vec2(.022,.105)));
    for(int i=0;i<3;i++) for(int side=-1;side<=1;side+=2) base=mix(base,ink,line(vec2(float(side)*.18,-.06-float(i)*.045),vec2(float(side)*.43,-.035-float(i)*.075),.008));
    base=mix(base,pink,oval(vec2(0.,-.005),vec2(.065,.04)));
  }
  if(character==2){
    base=vec3(1.,.52,.21);
    base=mix(base,cream,oval(vec2(0.,-.24),vec2(.47,.34)));
    base=mix(base,cream,oval(vec2(0.,.17),vec2(.055,.25)));
    base=mix(base,ink,oval(vec2(0.,-.005),vec2(.07,.045)));
  }
  if(character==3){
    for(int i=0;i<2;i++) base=mix(base,ink,oval(features[i].xy,vec2(features[i].z*1.8,max(.095,features[i].w*2.5))));
    base=mix(base,ink,oval(vec2(0.,-.005),vec2(.075,.045)));
  }
  if(character==4){
    base=vec3(1.,.79,.68);
    for(int i=0;i<2;i++){
      base=mix(base,pink,oval(features[i].xy+vec2(0.,-.15),vec2(.095,.055))*.7);
      vec2 brow=features[i].xy+vec2(0.,features[i].w+.055);
      base=mix(base,vec3(.34,.23,.26),oval(brow,vec2(features[i].z,.018)));
    }
  }
  float alpha=opacity;
  for(int i=0;i<3;i++) alpha*=1.-oval(features[i].xy,features[i].zw);
  float diffuse=abs(dot(normalize(n),normalize(vec3(-.3,.4,1.))));
  color=vec4(base*(.83+.17*diffuse),alpha);
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
  private meshProgram: WebGLProgram;
  private faceProgram: WebGLProgram;
  private photo: WebGLTexture;
  private mask: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private quad: WebGLVertexArrayObject;
  private mesh: WebGLVertexArrayObject;
  private meshBuffer: WebGLBuffer;
  private meshKey = '';
  private meshCount = 0;
  private meshData: Float32Array = new Float32Array(0);
  private faceMesh: WebGLVertexArrayObject;
  private faceBuffer: WebGLBuffer;
  private faceKey = '';
  private faceCount = 0;
  private faceFeatures: Float32Array = new Float32Array(12);
  faceTriangles: number[][] = [];
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
    this.meshProgram = program(gl, MESH_VERTEX, MESH_FRAGMENT);
    this.faceProgram = program(gl, FACE_VERTEX, FACE_FRAGMENT);
    this.quad = gl.createVertexArray()!;
    this.photo = this.texture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.mask = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 255, 0, 255]));
    this.fbo = gl.createFramebuffer()!;
    this.mesh = gl.createVertexArray()!;
    this.meshBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.mesh); gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    this.faceMesh = gl.createVertexArray()!;
    this.faceBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.faceMesh); gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuffer);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, i === 2 ? 2 : 3, gl.FLOAT, false, 32, i * 12); }
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

  render(settings: PortraitSettings) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) throw new Error('人像渲染已中断，请重新选择照片');
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) { this.canvas.width = this.width; this.canvas.height = this.height; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true); gl.depthMask(true);
    const face = this.faces[Math.min(this.faces.length - 1, Math.floor(settings.faceIndex))];
    const sticker = face && settings.sticker !== 'none' ? this.layoutSticker(face, settings) : null;
    const view = sticker?.view || { zoom: 1, offset: [0, 0] };
    gl.useProgram(this.photoProgram); gl.bindVertexArray(this.quad);
    gl.uniform1f(gl.getUniformLocation(this.photoProgram, 'viewZoom'), view.zoom);
    gl.uniform2f(gl.getUniformLocation(this.photoProgram, 'viewOffset'), view.offset[0], view.offset[1]);
    this.bindTexture(this.photoProgram, 'photo', this.photo, 0); this.bindTexture(this.photoProgram, 'mask', this.mask, 1);
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
    if (face && settings.faceEffect !== 'none' && settings.faceEffectStrength > 0) this.drawFace(face, settings, view);
    if (sticker) this.drawSticker(sticker, settings);
    return this.canvas;
  }

  private layoutSticker(face: NormalizedLandmark[], settings: PortraitSettings) {
    const gl = this.gl, key = `${settings.sticker}:${settings.stickerColor}`;
    if (key !== this.meshKey) {
      const data = buildSticker(settings.sticker, settings.stickerColor);
      this.meshData = data;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.meshCount = data.length / 9; this.meshKey = key;
    }
    const vector = (a: number, b: number): [number, number, number] => [face[a].x - face[b].x, -(face[a].y - face[b].y) * this.height / this.width, -(face[a].z - face[b].z)];
    const right = normalize(vector(263, 33)), forward = normalize(cross(right, normalize(vector(10, 152)))), up = normalize(cross(forward, right));
    const width = Math.hypot((face[454].x - face[234].x) * this.width, (face[454].y - face[234].y) * this.height);
    const eyeY = (face[33].y + face[263].y) / 2;
    const origin = [(face[33].x + face[263].x) - 1, 1 - 2 * (face[10].y * .75 + eyeY * .25)];
    const scale = [width / this.width * settings.stickerScale, width / this.height * settings.stickerScale];
    const angle = settings.stickerRotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const points: [number, number][] = [];
    for (let i = 0; i < this.meshData.length; i += 9) {
      const x = c * this.meshData[i] - s * this.meshData[i + 1];
      const y = s * this.meshData[i] + c * this.meshData[i + 1] + settings.stickerY;
      const z = this.meshData[i + 2];
      points.push([origin[0] + (right[0] * x + up[0] * y + forward[0] * z) * scale[0], origin[1] + (right[1] * x + up[1] * y + forward[1] * z) * scale[1]]);
    }
    return { basis: new Float32Array([...right, ...up, ...forward]), origin, scale, view: fitPortraitFrame(points) };
  }

  private drawSticker(layout: ReturnType<PortraitRenderer['layoutSticker']>, settings: PortraitSettings) {
    const gl = this.gl;
    gl.useProgram(this.meshProgram); gl.bindVertexArray(this.mesh);
    gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'opacity'), 1);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.meshProgram, 'basis'), false, layout.basis);
    gl.uniform2f(gl.getUniformLocation(this.meshProgram, 'origin'), layout.origin[0], layout.origin[1]);
    gl.uniform2f(gl.getUniformLocation(this.meshProgram, 'scale'), layout.scale[0], layout.scale[1]);
    gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'viewZoom'), layout.view.zoom);
    gl.uniform2f(gl.getUniformLocation(this.meshProgram, 'viewOffset'), layout.view.offset[0], layout.view.offset[1]);
    gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'angle'), settings.stickerRotation * Math.PI / 180);
    gl.uniform1f(gl.getUniformLocation(this.meshProgram, 'offsetY'), settings.stickerY);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.drawArrays(gl.TRIANGLES, 0, this.meshCount); gl.disable(gl.DEPTH_TEST);
  }

  private drawFace(face: NormalizedLandmark[], settings: PortraitSettings, view: { zoom: number; offset: readonly number[] }) {
    const gl = this.gl, key = String(settings.faceIndex);
    if (key !== this.faceKey) {
      const data = buildFaceMesh(face, this.faceTriangles, this.width / this.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuffer); gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
      this.faceCount = data.vertices.length / 8; this.faceFeatures = data.features; this.faceKey = key;
    }
    gl.useProgram(this.faceProgram); gl.bindVertexArray(this.faceMesh);
    gl.uniform2f(gl.getUniformLocation(this.faceProgram, 'viewOffset'), view.offset[0], view.offset[1]);
    gl.uniform1f(gl.getUniformLocation(this.faceProgram, 'viewZoom'), view.zoom);
    gl.uniform1f(gl.getUniformLocation(this.faceProgram, 'opacity'), settings.faceEffectStrength / 100);
    gl.uniform1i(gl.getUniformLocation(this.faceProgram, 'character'), ['none','cat','fox','panda','avatar'].indexOf(settings.faceEffect));
    gl.uniform4fv(gl.getUniformLocation(this.faceProgram, 'features[0]'), this.faceFeatures);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    [this.photoProgram, this.maskProgram, this.meshProgram, this.faceProgram].forEach(p => gl.deleteProgram(p));
    [this.photo, this.mask].forEach(t => gl.deleteTexture(t));
    gl.deleteFramebuffer(this.fbo); gl.deleteBuffer(this.meshBuffer); gl.deleteVertexArray(this.quad); gl.deleteVertexArray(this.mesh);
    gl.deleteBuffer(this.faceBuffer); gl.deleteVertexArray(this.faceMesh);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
