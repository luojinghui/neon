import type { Detection } from '@mediapipe/tasks-vision';
import type { RenderRect } from '../../types';

const BASE_FRAME_WIDTH = 640;
const BASE_FRAME_HEIGHT = 360;

interface FaceTrack {
  x: number;
  y: number;
  width: number;
  height: number;
  sampleX: number;
  sampleY: number;
  sampleTime: number;
  velocityX: number;
  velocityY: number;
  matched: boolean;
  rect: RenderRect;
}

/** 2D 贴纸和虚拟头像的连续定位；复用跟踪状态及绘制区域，与渲染后端无关。 */
export class FaceRectLayout {
  private tracks: FaceTrack[] = [];
  private rects: RenderRect[] = [];
  private lastTimestamp = -1;
  private frameWidth = 0;
  private frameHeight = 0;

  public reset() {
    this.tracks.length = 0;
    this.rects.length = 0;
    this.lastTimestamp = -1;
  }

  /**
   * 慢速时抑制检测抖动，快速移动时缩短平滑时间；保留亚像素位移，避免死区造成阶梯跳动。
   *
   * @param { Detection[] } detections - 当前帧的人脸检测结果，检测框坐标单位为像素。
   * @param { HTMLImageElement } image - 已加载的贴纸，用于 contain 模式的宽高比计算。
   * @param { number } frameWidth - 视频帧宽度，单位像素。
   * @param { number } frameHeight - 视频帧高度，单位像素。
   * @param { string } fit - 默认 fill 填满补偿后的区域；contain 等比缩放并居中。
   * @param { number } timestamp - 视频媒体时间，单位毫秒，用于保持不同帧率下的跟随速度。
   * @param { number } detectionTimestamp - 检测结果的媒体时间；低频结果复用时用于限制外推范围。
   * @returns { RenderRect[] } - 借用的未镜像像素区域，下次调用时复用。
   */
  public getRects(
    detections: Detection[],
    image: HTMLImageElement,
    frameWidth: number,
    frameHeight: number,
    fit = 'fill',
    timestamp = performance.now(),
    detectionTimestamp = timestamp
  ): RenderRect[] {
    const elapsed = timestamp - this.lastTimestamp;
    if (
      this.lastTimestamp < 0 ||
      elapsed <= 0 ||
      elapsed > 250 ||
      frameWidth !== this.frameWidth ||
      frameHeight !== this.frameHeight
    ) {
      this.tracks.length = 0;
    }
    const dt = Math.max(1, Math.min(elapsed, 100));
    this.lastTimestamp = timestamp;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.rects.length = 0;
    for (const track of this.tracks) track.matched = false;
    const scaleX = Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth / BASE_FRAME_WIDTH : 1;
    const scaleY = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight / BASE_FRAME_HEIGHT : 1;
    for (const { boundingBox: box } of detections) {
      if (!box || box.width <= 0 || box.height <= 0) continue;
      const x = box.originX + box.width / 2;
      const y = box.originY + box.height / 2;
      const faceSize = Math.max(box.width, box.height);
      let track: FaceTrack | undefined;
      let nearest = 0.75;
      // 检测结果可能按置信度重排，按空间距离关联，避免多人时在两张脸之间插值。
      for (const candidate of this.tracks) {
        if (candidate.matched) continue;
        const distance =
          (Math.hypot(x - candidate.x, y - candidate.y) +
            Math.abs(box.width - candidate.width) +
            Math.abs(box.height - candidate.height)) /
          faceSize;
        if (distance < nearest) {
          nearest = distance;
          track = candidate;
        }
      }
      if (!track) {
        track = {
          x,
          y,
          width: box.width,
          height: box.height,
          sampleX: x,
          sampleY: y,
          sampleTime: detectionTimestamp,
          velocityX: 0,
          velocityY: 0,
          matched: true,
          rect: { x: 0, y: 0, width: 0, height: 0 }
        };
        this.tracks.push(track);
      } else {
        const sampleDt = detectionTimestamp - track.sampleTime;
        if (sampleDt > 0) {
          const maxSpeed = faceSize * 0.003;
          const velocityX = Math.max(-maxSpeed, Math.min(maxSpeed, (x - track.sampleX) / sampleDt));
          const velocityY = Math.max(-maxSpeed, Math.min(maxSpeed, (y - track.sampleY) / sampleDt));
          track.velocityX = sampleDt > 250 ? 0 : (track.velocityX + velocityX) / 2;
          track.velocityY = sampleDt > 250 ? 0 : (track.velocityY + velocityY) / 2;
          track.sampleX = x;
          track.sampleY = y;
          track.sampleTime = detectionTimestamp;
        }
        // 低频检测的间隔帧仍连续跟随，最多外推 50ms，避免旧结果长期漂移。
        const prediction = Math.max(0, Math.min(50, timestamp - detectionTimestamp));
        const targetX = x + track.velocityX * prediction;
        const targetY = y + track.velocityY * prediction;
        const motion = Math.min(1, (Math.hypot(targetX - track.x, targetY - track.y) * 1000) / (faceSize * dt * 2));
        const positionAlpha = 1 - Math.exp(-dt / (50 - 38 * motion));
        const sizeMotion = Math.min(
          1,
          (Math.max(Math.abs(box.width - track.width), Math.abs(box.height - track.height)) * 1000) / (faceSize * dt)
        );
        const sizeAlpha = 1 - Math.exp(-dt / (80 - 55 * sizeMotion));
        track.x += (targetX - track.x) * positionAlpha;
        track.y += (targetY - track.y) * positionAlpha;
        track.width += (box.width - track.width) * sizeAlpha;
        track.height += (box.height - track.height) * sizeAlpha;
        track.matched = true;
      }
      const rect = track.rect;
      rect.x = track.x - track.width / 2 - 23 * scaleX;
      rect.y = track.y - track.height / 2 - 56 * scaleY;
      rect.width = track.width + 40 * scaleX;
      rect.height = track.height + 50 * scaleY;
      if (fit === 'contain' && image.naturalWidth > 0 && image.naturalHeight > 0) {
        const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const fittedWidth = image.naturalWidth * scale;
        const fittedHeight = image.naturalHeight * scale;
        rect.x += (rect.width - fittedWidth) / 2;
        rect.y += (rect.height - fittedHeight) / 2;
        rect.width = fittedWidth;
        rect.height = fittedHeight;
      }
      this.rects.push(rect);
    }
    // 丢脸后立即清除状态，重新入镜时直接定位，不把旧贴纸拖到新位置。
    let count = 0;
    for (const track of this.tracks) {
      if (track.matched) this.tracks[count++] = track;
    }
    this.tracks.length = count;
    return this.rects;
  }
}
