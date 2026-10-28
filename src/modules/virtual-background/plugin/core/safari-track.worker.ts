/**
 * Safari 的 MediaStreamTrackProcessor 与 VideoTrackGenerator 只存在于 Dedicated Worker。
 * 这里只建立轨道端点，把帧交给主线程已有的画面处理，再写回生成轨道。
 */
type WorkerFrame = { close: () => void };
type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  close: () => void;
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack; maxBufferSize?: number }) => { readable: ReadableStream<WorkerFrame> };
  VideoTrackGenerator?: new () => { track: MediaStreamTrack; writable: WritableStream<WorkerFrame> };
};

const scope = globalThis as unknown as WorkerScope;
let inputTrack: MediaStreamTrack | undefined;
let reader: ReadableStreamDefaultReader<WorkerFrame> | undefined;
let writer: WritableStreamDefaultWriter<WorkerFrame> | undefined;
let pending: ((frame: WorkerFrame | null) => void) | undefined;
let stopped = false;

function post(message: unknown, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

function closeFrame(frame?: WorkerFrame | null) {
  if (!frame) return;
  try {
    frame.close();
  } catch {
    // 帧已经关闭或已经转移时再关闭会抛错，忽略即可。
  }
}

function stop() {
  if (stopped) return;
  stopped = true;
  const resolve = pending;
  pending = undefined;
  resolve?.(null);
  try {
    inputTrack?.stop();
  } catch {
    // 采集端可能已经结束。
  }
  reader?.cancel().catch(() => undefined);
  writer?.close().catch(() => undefined);
  scope.close();
}

async function start(track: MediaStreamTrack) {
  inputTrack = track;
  if (stopped) {
    track.stop();
    return;
  }
  const Processor = scope.MediaStreamTrackProcessor;
  const Generator = scope.VideoTrackGenerator;
  if (typeof Processor !== 'function' || typeof Generator !== 'function') {
    track.stop();
    post({ type: 'error', message: '处理线程缺少视频轨道接口' });
    stop();
    return;
  }
  try {
    const processor = new Processor({ track, maxBufferSize: 1 });
    const generator = new Generator();
    reader = processor.readable.getReader();
    writer = generator.writable.getWriter();
    post({ type: 'ready', track: generator.track }, [generator.track as unknown as Transferable]);
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done || !value || stopped) {
        closeFrame(value);
        break;
      }
      const output = await new Promise<WorkerFrame | null>((resolve) => {
        pending = resolve;
        post({ type: 'frame', frame: value }, [value as unknown as Transferable]);
      });
      if (!output || stopped) {
        closeFrame(output);
        break;
      }
      await writer.write(output);
      closeFrame(output);
    }
  } catch (error) {
    if (!stopped) post({ type: 'error', message: error instanceof Error ? error.message : '视频处理线程中断' });
  } finally {
    stop();
  }
}

scope.onmessage = (event: MessageEvent) => {
  const data = event.data as { type?: string; track?: MediaStreamTrack; frame?: WorkerFrame } | null;
  if (data?.type === 'start' && data.track) {
    void start(data.track);
    return;
  }
  if (data?.type === 'stop') {
    stop();
    return;
  }
  if (data?.type === 'frame' || data?.type === 'drop') {
    const resolve = pending;
    pending = undefined;
    if (resolve) resolve(data.type === 'frame' ? data.frame ?? null : null);
    else closeFrame(data.frame);
  }
};

export {};
