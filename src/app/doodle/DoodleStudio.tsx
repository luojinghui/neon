'use client';

import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  SmileOutlined,
  StarFilled,
  ThunderboltFilled
} from '@ant-design/icons';
import { App, Button, QRCode, Spin, Switch } from 'antd';
import NextImage from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDoodleReview, createDoodleShare, deleteDoodleShare, updateDoodleReview, updateDoodleShare } from './client';
import { canvasToBlob, DOODLE_TEMPLATES, DOODLE_THEMES, DOODLE_TITLES, renderDoodlePoster } from './poster';
import { createSmileDetector, type SmileDetector } from './smileDetector';
import type { DoodleShare, DoodleTemplateId, DoodleThemeId } from './types';
import './doodle.css';

type StudioMode = 'welcome' | 'camera' | 'processing' | 'result';
type SmileState = 'loading' | 'ready' | 'unavailable';

type ShareInfo = {
  record: DoodleShare;
  url: string;
  dirty: boolean;
};

type ReviewPayload = {
  blob: Blob;
  title: string;
  themeId: DoodleThemeId;
  templateId: DoodleTemplateId;
  shareId: string;
  version: number;
};

type ReviewContext = {
  id: string;
  key: string;
  original: Blob;
  latest: ReviewPayload;
  syncedVersion: number;
  creating: boolean;
  syncing: boolean;
  stopped: boolean;
};

const REVIEW_RETRY_DELAYS = [0, 800, 1800, 4000, 8000];

function wait(delay: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delay));
}

function isFinalReviewError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  return [
    'REVIEW_GONE',
    'REVIEW_NOT_FOUND',
    'REVIEW_FORBIDDEN',
    'IMAGE_TOO_LARGE',
    'IMAGE_TYPE_INVALID',
    'IMAGE_EMPTY',
    'TITLE_INVALID',
    'STYLE_INVALID',
    'TEMPLATE_INVALID',
    'UUID_INVALID',
    'REVIEW_KEY_INVALID'
  ].includes(code);
}

async function retryReviewTask<T>(task: () => Promise<T>) {
  let lastError: unknown;
  for (const delay of REVIEW_RETRY_DELAYS) {
    if (delay) await wait(delay);
    try {
      return await task();
    } catch (error) {
      if (isFinalReviewError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function syncReviewContext(context: ReviewContext) {
  if (!context.id || context.syncing || context.stopped || context.syncedVersion >= context.latest.version) return;
  context.syncing = true;
  void (async () => {
    let retryScheduled = false;
    try {
      while (!context.stopped && context.syncedVersion < context.latest.version) {
        const snapshot = context.latest;
        await retryReviewTask(() => updateDoodleReview(context.id, snapshot.blob, snapshot.title, snapshot.themeId, snapshot.templateId, snapshot.shareId));
        context.syncedVersion = snapshot.version;
      }
    } catch (error) {
      if (isFinalReviewError(error)) context.stopped = true;
      else {
        console.warn('Doodle review background sync will retry:', error);
        retryScheduled = true;
        window.setTimeout(() => syncReviewContext(context), 30_000);
      }
    } finally {
      context.syncing = false;
      if (!retryScheduled && !context.stopped && context.syncedVersion < context.latest.version) syncReviewContext(context);
    }
  })();
}

function createReviewContext(context: ReviewContext) {
  if (context.creating || context.id || context.stopped) return;
  context.creating = true;
  const snapshot = context.latest;
  void retryReviewTask(() => createDoodleReview(context.original, snapshot.blob, snapshot.title, snapshot.themeId, snapshot.templateId, snapshot.shareId, context.key))
    .then((review) => {
      context.id = review.id;
      context.syncedVersion = snapshot.version;
      syncReviewContext(context);
    })
    .catch((error) => {
      if (isFinalReviewError(error)) context.stopped = true;
      else {
        console.warn('Doodle review background upload will retry:', error);
        window.setTimeout(() => createReviewContext(context), 30_000);
      }
    })
    .finally(() => {
      context.creating = false;
    });
}

function randomTitle(exclude = '') {
  const options = DOODLE_TITLES.filter((item) => item !== exclude);
  return options[Math.floor(Math.random() * options.length)] || DOODLE_TITLES[0];
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(source, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
}

function waitForPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function readQrImage(holder: HTMLDivElement | null) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const svg = holder?.querySelector('svg');
    if (svg) {
      const markup = new XMLSerializer().serializeToString(svg);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('二维码生成失败，请重试'));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      });
      return image;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error('二维码生成超时，请重试');
}

export default function DoodleStudio() {
  const { message, modal } = App.useApp();
  const [mode, setMode] = useState<StudioMode>('welcome');
  const [cameraError, setCameraError] = useState('');
  const [smileState, setSmileState] = useState<SmileState>('loading');
  const [smileEnabled, setSmileEnabled] = useState(true);
  const [faceHint, setFaceHint] = useState('把脸放进轮廓里');
  const [countdown, setCountdown] = useState(0);
  const [title, setTitle] = useState(() => randomTitle());
  const [themeId, setThemeId] = useState<DoodleThemeId>('sun-pop');
  const [templateId, setTemplateId] = useState<DoodleTemplateId>('comic-cover');
  const [resultUrl, setResultUrl] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const qrHolderRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<SmileDetector | null>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultUrlRef = useRef('');
  const detectingRef = useRef(false);
  const captureLockRef = useRef(false);
  const smileHoldRef = useRef(0);
  const smileEnabledRef = useRef(smileEnabled);
  const countdownTimersRef = useRef<number[]>([]);
  const reviewContextRef = useRef<ReviewContext | null>(null);

  useEffect(() => {
    smileEnabledRef.current = smileEnabled;
  }, [smileEnabled]);

  const replaceResult = useCallback(async (canvas: HTMLCanvasElement) => {
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = url;
    setResultUrl(url);
    setResultBlob(blob);
    return blob;
  }, []);

  const stopCamera = useCallback(() => {
    detectingRef.current = false;
    countdownTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    countdownTimersRef.current = [];
    captureLockRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopCamera();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [stopCamera]
  );

  const renderResult = useCallback(
    async (nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId, qrSource: CanvasImageSource | null = null) => {
      const source = rawCanvasRef.current;
      if (!source) throw new Error('原始照片已经丢失，请重新拍摄');
      const poster = renderDoodlePoster(source, source.width, source.height, {
        title: nextTitle,
        themeId: nextTheme,
        templateId: nextTemplate,
        qrSource
      });
      return replaceResult(poster);
    },
    [replaceResult]
  );

  const queueReviewUpdate = useCallback(
    (blob: Blob, nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId, shareId = '') => {
      const context = reviewContextRef.current;
      if (!context || context.stopped) return;
      context.latest = {
        blob,
        title: nextTitle,
        themeId: nextTheme,
        templateId: nextTemplate,
        shareId: shareId || context.latest.shareId,
        version: context.latest.version + 1
      };
      if (context.id) syncReviewContext(context);
    },
    []
  );

  const enterResult = useCallback(
    async (rawCanvas: HTMLCanvasElement) => {
      rawCanvasRef.current = rawCanvas;
      setMode('processing');
      setBusy(true);
      try {
        const processed = await renderResult(title, themeId, templateId);
        const original = await canvasToBlob(rawCanvas, 0.92);
        const reviewContext: ReviewContext = {
          id: '',
          key: window.crypto.randomUUID(),
          original,
          latest: { blob: processed, title, themeId, templateId, shareId: '', version: 0 },
          syncedVersion: -1,
          creating: false,
          syncing: false,
          stopped: false
        };
        reviewContextRef.current = reviewContext;
        setMode('result');
        createReviewContext(reviewContext);
      } catch (error) {
        rawCanvasRef.current = null;
        message.error(error instanceof Error ? error.message : '生成失败，请重试');
        setMode('welcome');
      } finally {
        captureLockRef.current = false;
        setBusy(false);
      }
    },
    [message, renderResult, templateId, themeId, title]
  );

  const captureVideo = useCallback(async () => {
    if (captureLockRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      message.warning('相机还在准备，请稍等一下');
      return;
    }
    captureLockRef.current = true;
    const raw = document.createElement('canvas');
    raw.width = 720;
    raw.height = 960;
    const context = raw.getContext('2d');
    if (!context) {
      captureLockRef.current = false;
      message.error('当前浏览器无法读取相机画面');
      return;
    }
    context.translate(raw.width, 0);
    context.scale(-1, 1);
    drawCover(context, video, video.videoWidth, video.videoHeight, raw.width, raw.height);
    stopCamera();
    setCountdown(0);
    await enterResult(raw);
  }, [enterResult, message, stopCamera]);

  const beginCountdown = useCallback(() => {
    if (captureLockRef.current || countdown) return;
    captureLockRef.current = true;
    setCountdown(3);
    countdownTimersRef.current = [
      window.setTimeout(() => setCountdown(2), 700),
      window.setTimeout(() => setCountdown(1), 1400),
      window.setTimeout(() => {
        captureLockRef.current = false;
        void captureVideo();
      }, 2100)
    ];
  }, [captureVideo, countdown]);

  const startDetection = useCallback(async () => {
    setSmileState('loading');
    const expectedStream = mediaStreamRef.current;
    try {
      const detector = await createSmileDetector();
      if (!expectedStream || mediaStreamRef.current !== expectedStream) {
        detector.close();
        return;
      }
      detectorRef.current = detector;
      setSmileState('ready');
      detectingRef.current = true;
      let lastRun = 0;
      const detect = (now: number) => {
        if (!detectingRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && now - lastRun > 120) {
          lastRun = now;
          try {
            const frame = detector.detect(video);
            if (!frame.hasFace) {
              setFaceHint('再靠近一点，我还没看见你');
              smileHoldRef.current = 0;
            } else if (frame.smileScore > 0.48) {
              setFaceHint('笑容收到，保持一下');
              if (!smileHoldRef.current) smileHoldRef.current = now;
              if (smileEnabledRef.current && now - smileHoldRef.current > 600) {
                smileHoldRef.current = 0;
                beginCountdown();
              }
            } else {
              setFaceHint(smileEnabledRef.current ? '看镜头，笑一下自动拍' : '准备好后点击快门');
              smileHoldRef.current = 0;
            }
          } catch {
            // Skip an occasional detector frame; the manual shutter remains available.
          }
        }
        requestAnimationFrame(detect);
      };
      requestAnimationFrame(detect);
    } catch {
      setSmileState('unavailable');
      setSmileEnabled(false);
      setFaceHint('准备好后点击快门');
    }
  }, [beginCountdown]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前浏览器不支持摄像头，请更换支持摄像头的浏览器');
      setMode('welcome');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      mediaStreamRef.current = stream;
      setMode('camera');
      await waitForPaint();
      if (!videoRef.current) throw new Error('相机预览初始化失败');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      void startDetection();
    } catch (error) {
      stopCamera();
      setMode('welcome');
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setCameraError(denied ? '没有获得摄像头权限，请在浏览器设置中允许后重试' : '摄像头暂时无法使用，请稍后重试');
    }
  }, [startDetection, stopCamera]);

  const rerender = useCallback(
    async (nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId) => {
      setBusy(true);
      try {
        const qrImage = shareInfo ? await readQrImage(qrHolderRef.current) : null;
        const processed = await renderResult(nextTitle, nextTheme, nextTemplate, qrImage);
        queueReviewUpdate(processed, nextTitle, nextTheme, nextTemplate);
        if (shareInfo) setShareInfo({ ...shareInfo, dirty: true });
        return true;
      } catch (error) {
        message.error(error instanceof Error ? error.message : '换装失败，请重试');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [message, queueReviewUpdate, renderResult, shareInfo]
  );

  const changeTitle = useCallback(() => {
    const next = randomTitle(title);
    void rerender(next, themeId, templateId).then((success) => {
      if (success) setTitle(next);
    });
  }, [rerender, templateId, themeId, title]);

  const changeTheme = useCallback(
    (next: DoodleThemeId) => {
      void rerender(title, next, templateId).then((success) => {
        if (success) setThemeId(next);
      });
    },
    [rerender, templateId, title]
  );

  const changeTemplate = useCallback(
    (next: DoodleTemplateId) => {
      void rerender(title, themeId, next).then((success) => {
        if (success) setTemplateId(next);
      });
    },
    [rerender, themeId, title]
  );

  const toggleSmileShutter = useCallback(() => {
    if (smileState === 'loading') {
      message.info('微笑检测还在加载，请稍等一下；也可以直接点击中间快门');
      return;
    }
    if (smileState === 'unavailable') {
      message.warning('微笑检测暂时不可用，请点击中间快门拍照');
      return;
    }
    setSmileEnabled((value) => !value);
  }, [message, smileState]);

  const saveImage = useCallback(() => {
    if (!resultUrl) return;
    const anchor = document.createElement('a');
    anchor.href = resultUrl;
    anchor.download = `漫游相机-${title}-${new Date().toISOString().slice(0, 10)}.jpg`;
    anchor.click();
    message.success('图片已开始保存');
  }, [message, resultUrl, title]);

  const publishShare = useCallback(async () => {
    if (!resultBlob || busy) return;
    setBusy(true);
    try {
      let current = shareInfo;
      if (!current) {
        const created = await createDoodleShare(resultBlob, title, themeId, templateId, reviewContextRef.current?.key || '');
        current = { record: created.share, url: created.shareUrl, dirty: false };
        setShareInfo(current);
        await waitForPaint();
      }
      const qrImage = await readQrImage(qrHolderRef.current);
      const finalBlob = await renderResult(title, themeId, templateId, qrImage);
      queueReviewUpdate(finalBlob, title, themeId, templateId, current.record.id);
      const updated = await updateDoodleShare(current.record.id, finalBlob, title, themeId, templateId);
      setShareInfo({ record: updated.share, url: updated.shareUrl, dirty: false });
      message.success(shareInfo ? '分享卡已更新' : '分享链接已生成，有效期 30 天');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '分享失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }, [busy, message, queueReviewUpdate, renderResult, resultBlob, shareInfo, templateId, themeId, title]);

  const copyShareLink = useCallback(async () => {
    if (!shareInfo) return;
    await navigator.clipboard.writeText(shareInfo.url);
    message.success('分享链接已复制');
  }, [message, shareInfo]);

  const systemShare = useCallback(async () => {
    if (!shareInfo) return;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `我的今日角色：${title}`, url: shareInfo.url });
      } else {
        await navigator.clipboard.writeText(shareInfo.url);
        message.success('当前浏览器不支持系统分享，链接已复制');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message.error('分享没有完成，请复制链接重试');
    }
  }, [message, shareInfo, title]);

  const destroyShare = useCallback(() => {
    if (!shareInfo) return;
    modal.confirm({
      title: '销毁这条分享？',
      content: '销毁后链接会立即失效，已经保存到他人设备的图片无法撤回。',
      okText: '立即销毁',
      okButtonProps: { danger: true },
      cancelText: '先保留',
      async onOk() {
        await deleteDoodleShare(shareInfo.record.id);
        setShareInfo(null);
        const processed = await renderResult(title, themeId, templateId, null);
        queueReviewUpdate(processed, title, themeId, templateId, shareInfo.record.id);
        message.success('分享链接和公开副本已删除');
      }
    });
  }, [message, modal, queueReviewUpdate, renderResult, shareInfo, templateId, themeId, title]);

  const retake = useCallback(() => {
    setShareInfo(null);
    reviewContextRef.current = null;
    rawCanvasRef.current = null;
    setResultBlob(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = '';
    setResultUrl('');
    void startCamera();
  }, [startCamera]);

  const expiresLabel = shareInfo
    ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(shareInfo.record.expiresAt))
    : '';

  return (
    <main className="doodle-page min-h-screen overflow-y-auto bg-[#fffaf0] text-[#201a17] dark:bg-[#17110f] dark:text-[#fff8ee]">
      <header className="sticky top-0 z-30 border-b-4 border-[#201a17] bg-[#fffaf0]/95 backdrop-blur dark:border-[#fff2df] dark:bg-[#17110f]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-black transition hover:bg-black/5 dark:hover:bg-white/10">
            <ArrowLeftOutlined />
            返回星球
          </Link>
          <div className="flex items-center gap-2 text-base font-black sm:text-lg">
            <span className="inline-flex h-9 w-9 rotate-[-6deg] items-center justify-center rounded-xl border-2 border-[#201a17] bg-[#ffd84d] text-[#201a17] shadow-[3px_3px_0_#201a17]">
              <CameraOutlined />
            </span>
            漫游相机
          </div>
          <span className="hidden rounded-full border-2 border-[#201a17] bg-[#79e7c2] px-3 py-1 text-xs font-black text-[#201a17] sm:inline">端侧生成 · 合规审核</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {mode === 'welcome' && (
          <section className="grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <div className="mb-5 inline-flex rotate-[-2deg] items-center gap-2 rounded-full border-2 border-[#201a17] bg-[#ff7ba8] px-4 py-2 text-sm font-black text-[#201a17] shadow-[4px_4px_0_#201a17]">
                <StarFilled /> 今日角色随机派送
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
                今天，你是
                <span className="relative mx-2 inline-block -rotate-2 text-[#ff5d46] dark:text-[#ff8b78]">什么角色？</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#554943] dark:text-[#d9c8bd]">
                拍一张自拍，把表情变成带猫耳、闪电和随机称号的漫画涂鸦。效果在本机生成，拍摄原图与生成成品会按隐私政策上传用于内容合规审核。
              </p>
              {cameraError && <div className="mt-5 rounded-2xl border-2 border-[#201a17] bg-[#fff0c9] p-4 font-bold text-[#8a3f21]">{cameraError}</div>}
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => void startCamera()} className="doodle-primary-button">
                  <CameraOutlined /> 打开相机
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#665750] dark:text-[#ccb9ad]">
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />端侧漫画处理</span>
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />原图与成品合规审核</span>
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />一键保存海报</span>
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />分享 30 天可销毁</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -left-7 top-16 z-10 rotate-[-12deg] text-6xl text-[#ff5d46]"><ThunderboltFilled /></div>
              <div className="absolute -right-4 bottom-20 z-10 rotate-12 text-5xl text-[#8b74ff]"><StarFilled /></div>
              <div className="rotate-2 rounded-[34px] border-[6px] border-[#201a17] bg-[#ffd84d] p-5 shadow-[14px_14px_0_#201a17]">
                <div className="aspect-[3/4] overflow-hidden rounded-[24px] border-4 border-[#201a17] bg-[linear-gradient(145deg,#ff7ba8_0_50%,#79e7c2_50%)] p-6">
                  <div className="flex h-full flex-col items-center justify-center rounded-[999px_999px_80px_80px] border-4 border-dashed border-[#201a17]/70 bg-white/35 text-center">
                    <SmileOutlined className="text-8xl" />
                    <span className="mt-5 rotate-[-3deg] rounded-full border-4 border-[#201a17] bg-white px-6 py-3 text-xl font-black shadow-[5px_5px_0_#201a17]">笑一下，咔嚓！</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {mode === 'camera' && (
          <section className="mx-auto max-w-3xl">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-black sm:text-4xl">对准轮廓，准备变身</h1>
              <p className="mt-2 font-semibold text-[#665750] dark:text-[#ccb9ad]">{faceHint}</p>
            </div>
            <div className="relative mx-auto aspect-[3/4] max-h-[68vh] overflow-hidden rounded-[32px] border-[6px] border-[#201a17] bg-black shadow-[12px_12px_0_#ff7ba8]">
              <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
              <div className="pointer-events-none absolute inset-[11%_14%_18%] rounded-[48%] border-4 border-dashed border-white/90 shadow-[0_0_0_999px_rgba(18,12,10,0.2)]" />
              {countdown > 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-[10rem] font-black text-white drop-shadow-[8px_8px_0_#201a17]">{countdown}</div>}
              <button type="button" onClick={() => smileState !== 'ready' && toggleSmileShutter()} className="absolute left-4 top-4 flex items-center gap-2 rounded-full border-2 border-[#201a17] bg-white/90 px-3 py-2 text-xs font-black text-[#201a17]">
                {smileState === 'loading' ? <LoadingOutlined /> : <SmileOutlined />}
                {smileState === 'ready' ? '微笑快门已就绪' : smileState === 'loading' ? '正在加载微笑快门' : '手动快门模式'}
              </button>
            </div>
            <div className="mt-7 flex items-center justify-center gap-5">
              <button onClick={() => void captureVideo()} aria-label="拍照" className="doodle-shutter"><span /></button>
              <button type="button" onClick={toggleSmileShutter} className="flex h-14 items-center gap-2 rounded-full border-2 border-[#201a17] bg-white px-4 text-sm font-black text-[#201a17] transition hover:-translate-y-0.5">
                <SmileOutlined />
                <span className="hidden sm:inline">微笑快门</span>
                <Switch size="small" checked={smileState === 'ready' && smileEnabled} className="pointer-events-none" />
              </button>
            </div>
          </section>
        )}

        {mode === 'processing' && (
          <section className="flex min-h-[65vh] flex-col items-center justify-center text-center">
            <div className="doodle-processing-orbit mb-8"><Spin indicator={<LoadingOutlined spin />} size="large" /></div>
            <h1 className="text-3xl font-black">正在领取你的今日角色…</h1>
            <p className="mt-3 font-semibold text-[#665750] dark:text-[#ccb9ad]">描轮廓、贴猫耳，再撒一点宇宙好运</p>
          </section>
        )}

        {mode === 'result' && resultUrl && (
          <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="mx-auto w-full max-w-[620px]">
              <div className="overflow-hidden rounded-[28px] border-[6px] border-[#201a17] bg-white shadow-[12px_12px_0_#201a17]">
                <NextImage src={resultUrl} alt={`漫画涂鸦：${title}`} width={1080} height={1440} unoptimized className="doodle-result-image block h-auto w-full" />
              </div>
              <p className="mt-5 text-center text-sm font-bold text-[#75645c] dark:text-[#cbb9ae]">手机可长按图片保存，也可以使用右侧保存按钮</p>
            </div>

            <aside className="space-y-5 lg:sticky lg:top-24">
              <div className="rounded-[26px] border-4 border-[#201a17] bg-white p-5 text-[#201a17] shadow-[7px_7px_0_#ff7ba8]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7a675d]">YOUR SOUL ROLE</p>
                <h1 className="mt-2 text-3xl font-black leading-tight">{title}</h1>
                <button onClick={changeTitle} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#fff0b8] px-4 py-2 text-sm font-black transition hover:rotate-[-1deg] hover:bg-[#ffe47d] disabled:opacity-50">
                  <ReloadOutlined /> 换个称号
                </button>

                <div className="mt-6 border-t-2 border-dashed border-[#201a17]/30 pt-5">
                  <p className="mb-3 text-sm font-black">选择卡片模板</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DOODLE_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => changeTemplate(template.id)}
                        disabled={busy}
                        className={`rounded-xl border-2 px-3 py-2 text-left transition hover:-translate-y-0.5 disabled:opacity-50 ${templateId === template.id ? 'border-[#201a17] bg-[#fff0b8] shadow-[2px_2px_0_#201a17]' : 'border-[#201a17]/20 bg-[#fffaf0]'}`}
                      >
                        <span className="block text-sm font-black">{template.name}</span>
                        <span className="mt-0.5 block text-[10px] font-bold text-[#806f65]">{template.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6 border-t-2 border-dashed border-[#201a17]/30 pt-5">
                  <p className="mb-3 text-sm font-black">换一套宇宙配色</p>
                  <div className="grid grid-cols-8 gap-2">
                    {DOODLE_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => changeTheme(theme.id)}
                        disabled={busy}
                        aria-label={theme.name}
                        title={theme.name}
                        className={`aspect-square rounded-xl border-2 border-[#201a17] transition hover:-translate-y-1 ${themeId === theme.id ? 'ring-4 ring-[#201a17]/20' : ''}`}
                        style={{ background: `linear-gradient(135deg, ${theme.primary} 0 50%, ${theme.secondary} 50%)` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border-4 border-[#201a17] bg-[#ffd84d] p-5 text-[#201a17] shadow-[7px_7px_0_#201a17]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">保存与分享</h2>
                    <p className="mt-1 text-xs font-bold opacity-70">分享链接会额外生成公开副本，有效 30 天</p>
                  </div>
                  <QrcodeOutlined className="text-3xl" />
                </div>
                <div className="mt-5 grid gap-3">
                  <Button size="large" icon={<DownloadOutlined />} onClick={saveImage} block className="!h-12 !border-[3px] !border-[#201a17] !font-black !shadow-[3px_3px_0_#201a17]">保存图片</Button>
                  <Button type="primary" size="large" icon={busy ? <LoadingOutlined /> : <ShareAltOutlined />} onClick={() => void publishShare()} disabled={busy} block className="!h-12 !border-[3px] !border-[#201a17] !bg-[#ff5d46] !font-black !shadow-[3px_3px_0_#201a17]">
                    {shareInfo ? (shareInfo.dirty ? '更新分享卡' : '重新同步分享卡') : '生成分享链接'}
                  </Button>
                </div>

                {shareInfo && (
                  <div className="mt-5 rounded-2xl border-2 border-[#201a17] bg-white p-4">
                    <div className="flex gap-4">
                      <div ref={qrHolderRef} className="shrink-0"><QRCode type="svg" value={shareInfo.url} size={112} color="#201a17" bgColor="#ffffff" bordered={false} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-sm font-black text-[#15966a]"><CheckCircleFilled /> 链接已生效</p>
                        <p className="mt-2 text-xs font-bold text-[#75645c]">有效至 {expiresLabel}</p>
                        {shareInfo.dirty && <p className="mt-2 text-xs font-black text-[#d75434]">当前改动尚未同步</p>}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button icon={<CopyOutlined />} onClick={() => void copyShareLink()} disabled={shareInfo.dirty}>复制链接</Button>
                      <Button icon={<ShareAltOutlined />} onClick={() => void systemShare()} disabled={shareInfo.dirty}>系统分享</Button>
                    </div>
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={destroyShare} block className="!mt-2">销毁分享</Button>
                  </div>
                )}
              </div>

              <button onClick={retake} className="doodle-secondary-button w-full justify-center"><CameraOutlined /> 重新拍一张</button>
            </aside>
          </section>
        )}
      </div>

      {busy && mode === 'result' && <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/15 backdrop-blur-[2px]"><div className="rounded-2xl border-4 border-[#201a17] bg-white px-6 py-4 text-lg font-black text-[#201a17] shadow-[6px_6px_0_#201a17]"><LoadingOutlined spin className="mr-3" />正在施展涂鸦魔法</div></div>}
    </main>
  );
}

export function DoodleStudioWithApp() {
  return (
    <App>
      <DoodleStudio />
    </App>
  );
}
