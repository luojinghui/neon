import { trackFrameSize } from '../media-track/simulcast';
import { VIRTUAL_MODEL_PATH } from './catalog';
import XYLinkVirtualExtension, { VideoProcessor as PluginProcessor, VirtualKind, VirtualType, type IBackgroundOptions, type IBeautyOptions, type IStickyOptions, type IVirtualHeadOptions } from './plugin';
import { normalizeCallVideo, type CallVideoProcessor, type CallVideoSettings, type EffectSelection } from './settings';

type Status = { phase: 'off' | 'loading' | 'ready' | 'error'; progress: number; message: string };

function beautyOptions(settings: CallVideoSettings): IBeautyOptions {
  const brightness = settings.brightness / 100;
  const whitening = settings.whitening / 100;
  const brightnessEnabled = brightness > 0;
  const whiteningEnabled = whitening > 0;
  return { enabled: brightnessEnabled || whiteningEnabled, brightnessEnabled, whiteningEnabled, brightness, whitening };
}

function backgroundOptions(selection: EffectSelection): IBackgroundOptions {
  if (selection.type === VirtualType.BLUR) return { type: VirtualType.BLUR, level: selection.level ?? 20 };
  if (selection.type === VirtualType.IMAGE) return { type: VirtualType.IMAGE, url: selection.url };
  if (selection.type === VirtualType.VIDEO) return { type: VirtualType.VIDEO, url: selection.url };
  if (selection.type === VirtualType.COLOR) return { type: VirtualType.COLOR, color: selection.color || '#f08080' };
  return { type: VirtualType.NONE };
}

function stickerOptions(selection: EffectSelection): IStickyOptions {
  if (selection.type !== VirtualType.FACE_STICKY && selection.type !== VirtualType.FACE_STICKY_3D) return { type: VirtualType.NONE, url: '' };
  return { type: selection.type, url: selection.url || '' };
}

function avatarOptions(selection: EffectSelection): IVirtualHeadOptions {
  if (selection.type !== VirtualType.HEAD_VIRTUAL) return { type: VirtualType.NONE, url: '' };
  return { type: VirtualType.HEAD_VIRTUAL, url: selection.url || '' };
}

/** 把通话设置同步到虚拟背景插件，处理的是已有摄像头轨道，不再单独采集。 */
export function createVirtualCallProcessor(source: MediaStreamTrack, onStatus: (status: Status) => void, onFailure: (error: unknown) => void): CallVideoProcessor {
  let plugin: PluginProcessor | null = null;
  let settings = normalizeCallVideo({});
  let disposed = false;
  let applying: Promise<void> = Promise.resolve();

  const apply = () => {
    const current = plugin;
    if (!current || disposed) return applying;
    const next = settings;
    applying = applying.then(async () => {
      if (disposed || plugin !== current) return;
      await current.setBeautyOptions(beautyOptions(next));
      await current.setOptions(VirtualKind.BACKGROUND, backgroundOptions(next.background));
      await current.setOptions(VirtualKind.STICKY, stickerOptions(next.sticker));
      await current.setOptions(VirtualKind.HEAD, avatarOptions(next.avatar));
    }).catch((error: unknown) => {
      if (!disposed) onFailure(error);
    });
    return applying;
  };

  return {
    configure(value) {
      settings = normalizeCallVideo(value);
      void apply();
    },
    async start() {
      if (disposed) throw new Error('画面处理已取消');
      onStatus({ phase: 'loading', progress: 20, message: '正在准备画面效果' });
      const extension = new XYLinkVirtualExtension();
      plugin = extension.createProcessor({ modelPath: VIRTUAL_MODEL_PATH, maskBlur: 8 });
      await plugin.enable();
      await apply();
      if (disposed || !plugin) throw new Error('画面处理已取消');
      const size = trackFrameSize(source);
      const output = await plugin.process({ track: source, width: size.width, height: size.height });
      if (disposed) throw new Error('画面处理已取消');
      onStatus({ phase: 'ready', progress: 100, message: '已应用到我的画面' });
      return output.track;
    },
    dispose() {
      disposed = true;
      plugin?.destroy();
      plugin = null;
    }
  };
}
