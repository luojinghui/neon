/** 主线程是否自带可插入媒体流。Chrome / Edge 有；Safari 只在 Dedicated Worker 里提供。 */
export function mainThreadInsertableStreams(scope: object = globalThis): boolean {
  const runtime = scope as { MediaStreamTrackProcessor?: unknown; MediaStreamTrackGenerator?: unknown };
  return typeof runtime.MediaStreamTrackProcessor === 'function' && typeof runtime.MediaStreamTrackGenerator === 'function';
}
