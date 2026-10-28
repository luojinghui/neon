import { mainThreadInsertableStreams } from './insertable-support';

type FrameSink = Pick<TransformStreamDefaultController<VideoFrame>, 'enqueue'>;
type FrameTransform = (frame: VideoFrame, controller: FrameSink) => Promise<void>;

export { mainThreadInsertableStreams };

function closeFrame(frame?: VideoFrame) {
  if (!frame) return;
  try {
    frame.close();
  } catch {
    // 帧已经关闭或已经转移时再关闭会抛错，忽略即可。
  }
}

/** Chrome / Edge：主线程直接创建处理器和生成器。 */
function connectOnMainThread(track: MediaStreamTrack, transform: FrameTransform, signal: AbortSignal): MediaStreamTrack {
  const runtime = globalThis as unknown as {
    MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
    MediaStreamTrackGenerator: new (init: { kind: 'video' }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> };
  };
  const trackProcessor = new runtime.MediaStreamTrackProcessor({ track });
  const trackGenerator = new runtime.MediaStreamTrackGenerator({ kind: 'video' });
  const transformer = new TransformStream({ transform });
  trackProcessor.readable
    .pipeThrough(transformer)
    .pipeTo(trackGenerator.writable, { signal })
    .catch((error: unknown) => {
      if (!signal.aborted) console.warn('video processing pipeline error: ', error);
    });
  return trackGenerator;
}

/**
 * Safari：把摄像头副本送进 Worker，由 Worker 持有轨道端点。
 * 原轨道留在主线程，关闭效果后仍可恢复原画。
 */
function connectThroughWorker(track: MediaStreamTrack, transform: FrameTransform, signal: AbortSignal, createWorker: () => Worker): Promise<MediaStreamTrack> {
  const clone = track.clone();
  let worker: Worker;
  try {
    worker = createWorker();
  } catch (error) {
    clone.stop();
    throw error;
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      worker.postMessage({ type: 'stop' });
    } catch {
      clone.stop();
    }
    const timer = setTimeout(() => worker.terminate(), 1000);
    (timer as { unref?: () => void }).unref?.();
  };
  signal.addEventListener('abort', stop, { once: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error instanceof Error ? error : new Error('视频处理线程启动失败'));
    };
    const timer = setTimeout(() => fail(new Error('视频处理线程启动超时')), 8000);
    (timer as { unref?: () => void }).unref?.();
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; track?: MediaStreamTrack; frame?: VideoFrame; message?: string } | null;
      if (!data || stopped) {
        closeFrame(data?.frame);
        data?.track?.stop();
        return;
      }
      if (data.type === 'ready' && data.track) {
        if (settled) {
          data.track.stop();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(data.track);
        return;
      }
      if (data.type === 'error') {
        console.warn('video processing pipeline error: ', data.message);
        fail(new Error(data.message || '视频处理线程启动失败'));
        return;
      }
      if (data.type === 'frame' && data.frame) void deliver(data.frame);
    };
    worker.onerror = () => fail(new Error('视频处理线程启动失败'));
    try {
      worker.postMessage({ type: 'start', track: clone }, [clone as unknown as Transferable]);
    } catch (error) {
      fail(error);
    }

    async function deliver(frame: VideoFrame) {
      if (stopped || signal.aborted) {
        closeFrame(frame);
        reply({ type: 'drop' });
        return;
      }
      let output: VideoFrame | undefined;
      try {
        await transform(frame, { enqueue: (next) => { output = next; } });
      } catch (error) {
        closeFrame(frame);
        closeFrame(output);
        reply({ type: 'drop' });
        if (!signal.aborted) console.warn('video processing pipeline error: ', error);
        return;
      }
      if (!output || stopped || signal.aborted) {
        closeFrame(output);
        reply({ type: 'drop' });
        return;
      }
      reply({ type: 'frame', frame: output }, [output as unknown as Transferable]);
    }

    function reply(message: { type: 'frame' | 'drop'; frame?: VideoFrame }, transfer?: Transferable[]) {
      if (stopped) {
        closeFrame(message.frame);
        return;
      }
      try {
        if (transfer) worker.postMessage(message, transfer);
        else worker.postMessage(message);
      } catch (error) {
        closeFrame(message.frame);
        if (!stopped) console.warn('video processing pipeline error: ', error);
      }
    }
  });
}

/** 按当前环境接通一条视频处理管线，返回可发送的输出轨道。 */
export function connectVideoPipeline(track: MediaStreamTrack, transform: FrameTransform, signal: AbortSignal, createWorker?: () => Worker): Promise<MediaStreamTrack> {
  if (mainThreadInsertableStreams()) return Promise.resolve(connectOnMainThread(track, transform, signal));
  if (!createWorker) return Promise.reject(new Error('当前环境需要处理线程才能处理画面'));
  return connectThroughWorker(track, transform, signal, createWorker);
}
