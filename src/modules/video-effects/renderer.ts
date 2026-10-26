import type { VideoEffectsSettings } from './types';

const VERTEX = `#version 300 es
out vec2 uv;
void main() {
  vec2 position=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  uv=vec2(position.x,1.-position.y);
  gl_Position=vec4(position*2.-1.,0.,1.);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D photo;
uniform vec2 pixel;
uniform float whitening,smoothing;
float skinTone(vec3 rgb) {
  float luminance=dot(rgb,vec3(.299,.587,.114));
  float cb=-.168736*rgb.r-.331264*rgb.g+.5*rgb.b;
  float cr=.5*rgb.r-.418688*rgb.g-.081312*rgb.b;
  // Soft chroma/luminance weights include a range of complexions. Dark details,
  // neutral surfaces and saturated colours retain their original texture.
  float chroma=smoothstep(.015,.055,cr)*(1.-smoothstep(.20,.30,cr));
  chroma*=smoothstep(-.23,-.15,cb)*(1.-smoothstep(.025,.11,cb));
  return chroma*smoothstep(.06,.17,luminance)*(1.-smoothstep(.88,.99,luminance));
}
void main() {
  vec3 original=texture(photo,uv).rgb;
  vec3 processed=original;
  float skin=skinTone(original);
  if(smoothing>0. && skin>.001) {
    vec3 sum=original*2.;
    float weights=2.;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) {
      if(x==0 && y==0) continue;
      vec3 sampleColor=texture(photo,uv+vec2(x,y)*pixel*1.5).rgb;
      vec3 difference=sampleColor-original;
      float spatial=(x==0 || y==0)?1.:.7;
      float weight=exp(-dot(difference,difference)*95.)*spatial;
      sum+=sampleColor*weight;
      weights+=weight;
    }
    vec3 softened=sum/weights;
    // The range filter protects eyes, hair and high contrast boundaries.
    processed=mix(original,softened,smoothing*.82*skin);
  }
  if(whitening>0. && skin>.001) {
    float luminance=dot(processed,vec3(.299,.587,.114));
    float lift=whitening*.12*skin*(1.-smoothstep(.62,.98,luminance));
    processed+=max(vec3(0.),vec3(1.)-processed)*lift;
  }
  color=vec4(clamp(processed,0.,1.),1.);
}`;

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const result = gl.createProgram();
  if (!result) throw new Error('美颜暂不可用');
  const shaders: WebGLShader[] = [];
  try {
    for (const [index, source] of [VERTEX, FRAGMENT].entries()) {
      const shader = gl.createShader(index ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
      if (!shader) throw new Error('美颜暂不可用');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('美颜着色器初始化失败');
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error('美颜渲染初始化失败');
    return result;
  } catch (error) { gl.deleteProgram(result); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
}

/** Camera frame → one GPU pass → canvas track, with no model or CPU frame copies. */
export class CallRenderer {
  readonly canvas = document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly photo: WebGLTexture;
  private readonly vertices: WebGLVertexArrayObject;
  private readonly whitening: WebGLUniformLocation | null;
  private readonly smoothing: WebGLUniformLocation | null;
  private readonly pixel: WebGLUniformLocation | null;
  private disposed = false;
  private readonly lost = (event: Event) => { event.preventDefault(); this.onFailure?.(new Error('美颜暂不可用，已恢复原画')); };

  constructor(width: number, height: number, private readonly onFailure?: (error: unknown) => void) {
    this.canvas.width = width; this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('此浏览器暂不支持美颜');
    this.gl = gl;
    try {
      this.program = createProgram(gl);
      const photo = gl.createTexture(), vertices = gl.createVertexArray();
      if (!photo || !vertices) throw new Error('美颜暂不可用');
      this.photo = photo; this.vertices = vertices;
      gl.useProgram(this.program); gl.bindVertexArray(vertices); gl.bindTexture(gl.TEXTURE_2D, photo);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(this.program, 'photo'), 0);
      this.whitening = gl.getUniformLocation(this.program, 'whitening');
      this.smoothing = gl.getUniformLocation(this.program, 'smoothing');
      this.pixel = gl.getUniformLocation(this.program, 'pixel');
      this.canvas.addEventListener('webglcontextlost', this.lost);
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    }
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
  }

  render(source: TexImageSource, settings: VideoEffectsSettings): void {
    if (this.disposed || this.gl.isContextLost()) throw new Error('美颜画面已停止');
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program); gl.bindVertexArray(this.vertices);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.photo);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform2f(this.pixel, 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1f(this.whitening, settings.whitening / 100); gl.uniform1f(this.smoothing, settings.smoothing / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.gl.deleteTexture(this.photo); this.gl.deleteVertexArray(this.vertices); this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
  }
}
