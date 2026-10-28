import { trackFrameSize } from './simulcast';
import { TrackPipeline, type ProcessTrack, type TrackProcessor } from './pipeline';

/** 默认采集 720P、30fps，后续缩放由发送端联播完成。 */
export function cameraVideoConstraints(facingMode: 'user' | 'environment' = 'user'): MediaTrackConstraints {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    aspectRatio: { ideal: 16 / 9 }
  };
}

/**
 * 单独的摄像头采集轨道。
 * 插件通过 pipeline 接入，不直接调用 getUserMedia，方便其他相机模块复用同一条处理流。
 */
export class CameraTrack {
  readonly pipeline = new TrackPipeline();
  private raw: MediaStreamTrack | null = null;

  get source(): MediaStreamTrack | null {
    return this.raw;
  }

  async capture(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStreamTrack> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: cameraVideoConstraints(facingMode) });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('未找到可用摄像头');
    }
    stream.getTracks().filter((item) => item !== track).forEach((item) => item.stop());
    this.raw = track;
    return track;
  }

  connect(processor: TrackProcessor): this {
    this.pipeline.connect(processor);
    return this;
  }

  async output(): Promise<ProcessTrack> {
    const track = this.raw;
    if (!track || track.readyState !== 'live') throw new Error('摄像头尚未就绪');
    const size = trackFrameSize(track);
    return this.pipeline.run({ track, width: size.width, height: size.height });
  }

  stop(): void {
    this.pipeline.reset();
    this.raw?.stop();
    this.raw = null;
  }
}
