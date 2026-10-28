export const WEBGL_VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
uniform vec4 rect;
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = point;
  gl_Position = vec4((rect.xy + point * rect.zw) * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
out vec4 result;
`;

/** MediaPipe confidence 可能是不可线性过滤的 float 纹理，显式插值，不修改借用纹理的参数。 */
export const WEBGL_MASK_COPY = `${HEADER}
uniform sampler2D source;
void main() {
  ivec2 dimensions = textureSize(source, 0);
  vec2 position = vec2(uv.x, 1.0 - uv.y) * vec2(dimensions) - 0.5;
  ivec2 lower = ivec2(floor(position));
  vec2 fraction = fract(position);
  ivec2 maximum = dimensions - 1;
  float a = texelFetch(source, clamp(lower, ivec2(0), maximum), 0).r;
  float b = texelFetch(source, clamp(lower + ivec2(1, 0), ivec2(0), maximum), 0).r;
  float c = texelFetch(source, clamp(lower + ivec2(0, 1), ivec2(0), maximum), 0).r;
  float d = texelFetch(source, clamp(lower + ivec2(1, 1), ivec2(0), maximum), 0).r;
  float alpha = clamp(mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y), 0.0, 1.0);
  result = vec4(alpha, alpha, alpha, 1.0);
}`;

export const WEBGL_COPY = `${HEADER}
uniform sampler2D source;
void main() {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  result = texture(source, vec2(uv.x, 1.0 - uv.y));
}
`;

/** 保持源图顶部对应 FBO 的第 0 行，readPixels 后无需 CPU 翻转。crop 使用源图归一化坐标。 */
export const WEBGL_FACE_MOTION = `${HEADER}
uniform sampler2D source;
uniform vec4 crop;
void main() {
  vec3 color = texture(source, crop.xy + uv * crop.zw).rgb;
  float gray = dot(color, vec3(77.0, 150.0, 29.0) / 256.0);
  result = vec4(gray, gray, gray, 1.0);
}`;

/** mode 0 羽化前景 mask；1 背景权重预乘；2 归一化背景。 */
export const WEBGL_FILTER = `${HEADER}
uniform sampler2D source;
uniform sampler2D mask;
uniform vec4 params;
void main() {
  vec4 color = vec4(0.0);
  float weightSum = 0.0;
  for (int offset = -4; offset <= 4; offset++) {
    float distance = float(offset);
    vec2 sampleUv = uv + distance * params.xy;
    float weight = exp(-distance * distance / params.w);
    vec2 sourceUv = params.z > 0.5 && params.z < 1.5 ? vec2(sampleUv.x, 1.0 - sampleUv.y) : sampleUv;
    vec4 sampleColor = texture(source, sourceUv);
    if (params.z > 0.5 && params.z < 1.5) {
      float backgroundWeight = 1.0 - texture(mask, sampleUv).r;
      sampleColor = vec4(sampleColor.rgb * backgroundWeight, backgroundWeight);
    }
    color += sampleColor * weight;
    weightSum += weight;
  }
  color /= weightSum;
  result = params.z > 1.5 ? vec4(color.rgb / max(color.a, 0.00001), 1.0) : color;
}`;

export const WEBGL_BASE = `${HEADER}
uniform sampler2D video;
uniform sampler2D mask;
uniform sampler2D background;
uniform sampler2D guide;
// xy 为增亮/美白强度，z 为局部跟踪强度。
uniform vec4 beauty;
uniform vec4 skinParams;
uniform vec4 faceRects[4];
uniform vec4 faceEyes[4];
uniform vec4 faceMouths[4];
uniform vec4 color;
// x mode: 0 video / 1 color / 2 external image / 3 preblurred / 4 transparent.
// y useMask, z edgeRefinement.
uniform vec4 params;
float foregroundAlpha(vec3 videoColor) {
  float alpha = texture(mask, uv).r;
  if (params.z < 0.5 || alpha <= 0.01 || alpha >= 0.99) return alpha;
  vec2 dimensions = vec2(textureSize(mask, 0));
  vec2 gridPosition = uv * dimensions - 0.5;
  vec2 center = floor(gridPosition + 0.5);
  float weightedAlpha = 0.0;
  float totalWeight = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 grid = center + vec2(float(x), float(y));
      vec2 sampleUv = (grid + 0.5) / dimensions;
      vec2 distance = grid - gridPosition;
      vec3 colorDistance = texture(guide, sampleUv).rgb - videoColor;
      float weight = exp(-dot(distance, distance) / 2.0 - dot(colorDistance, colorDistance) / 0.06);
      weightedAlpha += texture(mask, sampleUv).r * weight;
      totalWeight += weight;
    }
  }
  return totalWeight < 0.00001 ? alpha : mix(alpha, weightedAlpha / totalWeight, 0.85);
}
float skinAlpha(vec3 original) {
  if (beauty.y <= 0.0 || beauty.z <= 0.0) return 0.0;
  // 人像概率约束肤色，脸、颈、手臂一起提亮，衣服和背景留在门外。
  float region = smoothstep(0.25, 0.65, texture(mask, uv).r);
  float luma = dot(original, vec3(0.299, 0.587, 0.114));
  float cb = (original.b - luma) * 0.564;
  float cr = (original.r - luma) * 0.713;
  // 额头高光饱和度低、颈部偏暗偏红。门槛覆盖这两类肤色，仍排除明显的红衣服和偏蓝背景。
  float chroma = smoothstep(-0.04, 0.012, cr) * (1.0 - smoothstep(0.22, 0.34, cr))
    * smoothstep(-0.34, -0.14, cb) * (1.0 - smoothstep(0.07, 0.16, cb));
  return region * chroma * beauty.z;
}
vec3 brighten(vec3 encoded, float skin) {
  float local = beauty.y * skin;
  if (beauty.x <= 0.0 && local <= 0.0) return encoded;
  // 显示空间的单调曲线：中间调增益明显、黑白端点固定，无逐像素 pow 或额外 LUT 采样。
  vec3 lifted = encoded + beauty.x * encoded * (1.0 - encoded);
  if (local <= 0.0) return lifted;
  local *= smoothstep(0.025, 0.12, dot(encoded, vec3(0.299, 0.587, 0.114)));
  // 仅减弱皮肤中的黄色分量；蓝通道最多靠近较低的红/绿通道，不把正常肤色推成冷蓝。
  float yellow = max(min(lifted.r, lifted.g) - lifted.b, 0.0);
  lifted += local * yellow * vec3(-0.035, -0.015, 0.34);
  float luma = dot(lifted, vec3(0.299, 0.587, 0.114));
  lifted = mix(lifted, vec3(luma), local * 0.07);
  return lifted + local * 0.44 * lifted * (1.0 - lifted);
}
void main() {
  vec4 videoColor = texture(video, vec2(uv.x, 1.0 - uv.y));
  if (params.x > 3.5) { result = vec4(0.0); return; }
  float foreground = 1.0;
  vec4 combined = videoColor;
  if (params.x >= 0.5) {
    vec4 backgroundColor = color;
    if (params.x > 1.5) {
      vec2 backgroundUv = params.x < 2.5 ? vec2(uv.x, 1.0 - uv.y) : uv;
      backgroundColor = texture(background, backgroundUv);
    }
    foreground = params.y < 0.5 ? 0.0 : foregroundAlpha(videoColor.rgb);
    combined = mix(backgroundColor, videoColor, foreground);
  }
  result = vec4(brighten(combined.rgb, skinAlpha(videoColor.rgb) * foreground), combined.a);
}`;
