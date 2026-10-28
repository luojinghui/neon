/** 插件处理链上的一帧视频描述，尺寸应与输入帧一致。 */
export interface ProcessTrack {
  track: MediaStreamTrack;
  width: number;
  height: number;
  onSizeChange?: (listener: (size: { width: number; height: number }) => void) => () => void;
}

/** 相机、采集等模块可串联的通用视频处理器。 */
export interface TrackProcessor {
  process(input: ProcessTrack): Promise<ProcessTrack>;
}

/** 按接入顺序执行处理器；空链原样返回输入。 */
export class TrackPipeline {
  private processors: TrackProcessor[] = [];

  connect(processor: TrackProcessor): this {
    this.processors.push(processor);
    return this;
  }

  reset(): void {
    this.processors = [];
  }

  get length(): number {
    return this.processors.length;
  }

  async run(input: ProcessTrack): Promise<ProcessTrack> {
    let current = input;
    for (const processor of this.processors) current = await processor.process(current);
    return current;
  }
}
