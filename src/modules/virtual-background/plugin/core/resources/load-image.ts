/**
 * 加载可用于画布绘制的图片，并在完成、失败或取消时移除事件监听。
 *
 * @param { string } url - 图片地址；跨域资源须允许匿名 CORS，Object URL 由调用方管理和释放。
 * @param { AbortSignal } signal - 取消信号，取消时终止当前图片加载。
 * @returns { Promise<HTMLImageElement> } - 已加载且原始宽高均大于 0 的图片。
 * @throws 地址为空、图片加载失败或请求取消时拒绝 Promise。
 */
export function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    if (!url) throw new Error('图片 URL 不能为空');
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(signal.reason);
    };
    image.crossOrigin = 'Anonymous';
    image.onload = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
      else reject(new Error('图片尺寸无效'));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('图片加载失败，请检查 URL 和跨域设置'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}
