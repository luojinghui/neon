'use client';

import {
  CameraOutlined,
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LoadingOutlined,
  PictureOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  SmileOutlined,
  StarFilled,
  ThunderboltFilled
} from '@ant-design/icons';
import { App, Button, QRCode, Spin, Switch } from 'antd';
import NextImage from 'next/image';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDoodleReview, createDoodleShare, deleteDoodleShare, updateDoodleReview, updateDoodleShare } from './client';
import { canvasToBlob, DOODLE_TEMPLATES, DOODLE_THEMES, DOODLE_TITLES, renderDoodlePoster } from './poster';
import { createSmileDetector, type SmileDetector } from './smileDetector';
import type { DoodleShare, DoodleTemplateId, DoodleThemeId } from './types';
import { analyzePortrait, type PortraitAnalysis } from './portrait/analyze';
import { DEFAULT_PORTRAIT, normalizePortrait, FACE_EFFECTS, MOODS, STICKERS, STICKER_COLORS, type PortraitSettings } from './portrait/settings';
import { PortraitControls } from './portrait/PortraitControls';
import { LivePreview } from './portrait/livePreview';
import { prepareVisionCache } from './visionRuntime';
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

async function imageFileToCanvas(file: File) {
  if (!file.size || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('请选择有效的图片文件');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('这张图片无法读取，请换一张重试'));
      image.src = sourceUrl;
    });

    if (!image.naturalWidth || !image.naturalHeight) throw new Error('这张图片没有有效内容');

    const raw = document.createElement('canvas');
    raw.width = 720;
    raw.height = 960;
    const context = raw.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理相册图片');
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, raw.width, raw.height);
    drawCover(context, image, image.naturalWidth, image.naturalHeight, raw.width, raw.height);
    return raw;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
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
  const [portrait, setPortrait] = useState<PortraitSettings>(DEFAULT_PORTRAIT);
  const [analysis, setAnalysis] = useState<PortraitAnalysis | null>(null);
  const portraitRef = useRef(portrait);
  const analysisRef = useRef<PortraitAnalysis | null>(null);
  const analysisRequestRef = useRef(0);
  const capturedAtRef = useRef(new Date());
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrImageRef = useRef<CanvasImageSource | null>(null);
  const previewRef = useRef<LivePreview<Blob> | null>(null);
  if (!previewRef.current) previewRef.current = new LivePreview(canvasToBlob, error => message.error(error instanceof Error ? error.message : '预览暂时无法更新，请重试'));

  const videoRef = useRef<HTMLVideoElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const qrHolderRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
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
    void prepareVisionCache();
    try {
      const saved = JSON.parse(localStorage.getItem('neon:portrait-settings:v1') || 'null');
      if (saved && typeof saved === 'object') { const next = normalizePortrait(saved); portraitRef.current = next; setPortrait(next); }
    } catch { /* Optional preferences, never persist photos. */ }
  }, []);

  useEffect(() => {
    smileEnabledRef.current = smileEnabled;
  }, [smileEnabled]);

  const publishResult = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = url;
    setResultUrl(url);
    setResultBlob(blob);
    return blob;
  }, []);

  const replaceResult = useCallback(async (canvas: HTMLCanvasElement) => publishResult(await canvasToBlob(canvas)), [publishResult]);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
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
      analysisRequestRef.current += 1;
      previewRef.current?.cancel();
      analysisRef.current?.renderer?.dispose();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [stopCamera]
  );

  const drawPoster = useCallback(
    (nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId, qrSource: CanvasImageSource | null = null, settings = portraitRef.current) => {
      const raw = rawCanvasRef.current;
      if (!raw) throw new Error('原始照片已经丢失，请重新拍摄');
      const source = analysisRef.current?.renderer?.render(settings) || raw;
      const poster = renderDoodlePoster(source, source.width, source.height, {
        title: nextTitle.trim() || '今日限定角色',
        themeId: nextTheme,
        templateId: nextTemplate,
        qrSource,
        portrait: settings,
        createdAt: capturedAtRef.current
      });
      const preview = previewCanvasRef.current;
      if (preview) {
        preview.width = poster.width; preview.height = poster.height;
        preview.getContext('2d')?.drawImage(poster, 0, 0);
        preview.style.opacity = '1';
      }
      return poster;
    },
    []
  );

  const renderResult = useCallback(async (nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId, qrSource: CanvasImageSource | null = null) => {
    previewRef.current?.cancel();
    return replaceResult(drawPoster(nextTitle, nextTheme, nextTemplate, qrSource));
  }, [drawPoster, replaceResult]);

  const queueReviewUpdate = useCallback(
    (blob: Blob, nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId, shareId = '') => {
      const context = reviewContextRef.current;
      if (!context || context.stopped) return;
      context.latest = {
        blob,
        title: nextTitle.trim() || '今日限定角色',
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
    async (rawCanvas: HTMLCanvasElement, fallbackMode: StudioMode = 'welcome', replaceSession = false) => {
      previewRef.current?.cancel();
      qrImageRef.current = null;
      const previousRawCanvas = rawCanvasRef.current;
      const previousAnalysis = analysisRef.current;
      const request = ++analysisRequestRef.current;
      rawCanvasRef.current = rawCanvas;
      setMode('processing');
      setBusy(true);
      try {
        await waitForPaint();
        const detected = await analyzePortrait(rawCanvas);
        if (request !== analysisRequestRef.current) { detected.renderer?.dispose(); return false; }
        analysisRef.current = detected;
        setAnalysis(detected);
        capturedAtRef.current = new Date();
        const key = window.crypto.randomUUID();
        const original = await canvasToBlob(rawCanvas, 0.92);
        const processed = await renderResult(title, themeId, templateId);
        previousAnalysis?.renderer?.dispose();
        const reviewContext: ReviewContext = {
          id: '',
          key,
          original,
          latest: { blob: processed, title: title.trim() || '今日限定角色', themeId, templateId, shareId: '', version: 0 },
          syncedVersion: -1,
          creating: false,
          syncing: false,
          stopped: false
        };
        if (replaceSession) setShareInfo(null);
        reviewContextRef.current = reviewContext;
        setMode('result');
        createReviewContext(reviewContext);
        return true;
      } catch (error) {
        if (analysisRef.current !== previousAnalysis) analysisRef.current?.renderer?.dispose();
        if (fallbackMode !== 'result') previousAnalysis?.renderer?.dispose();
        analysisRef.current = fallbackMode === 'result' ? previousAnalysis : null;
        setAnalysis(analysisRef.current);
        rawCanvasRef.current = fallbackMode === 'result' ? previousRawCanvas : null;
        message.error(error instanceof Error ? error.message : '生成失败，请重试');
        setMode(fallbackMode);
        return false;
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
    const requestId = cameraRequestRef.current;
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
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      setMode('camera');
      await waitForPaint();
      if (cameraRequestRef.current !== requestId) return;
      if (!videoRef.current) throw new Error('相机预览初始化失败');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (cameraRequestRef.current !== requestId) return;
      void startDetection();
    } catch (error) {
      if (cameraRequestRef.current !== requestId) return;
      stopCamera();
      setMode('welcome');
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      setCameraError(denied ? '没有获得摄像头权限，请在浏览器设置中允许后重试' : '摄像头暂时无法使用，请稍后重试');
    }
  }, [startDetection, stopCamera]);

  const openAlbum = useCallback(() => {
    if (busy || !albumInputRef.current) return;
    albumInputRef.current.value = '';
    albumInputRef.current.click();
  }, [busy]);

  const selectAlbumImage = useCallback(
    async (file: File | undefined) => {
      if (!file || busy) return;
      const fallbackMode: StudioMode = mode === 'result' && resultUrlRef.current ? 'result' : 'welcome';
      stopCamera();
      setCountdown(0);
      setCameraError('');
      setMode('processing');
      setBusy(true);
      try {
        const raw = await imageFileToCanvas(file);
        await enterResult(raw, fallbackMode, true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '相册图片读取失败，请换一张重试';
        setCameraError(errorMessage);
        setMode(fallbackMode);
        message.error(errorMessage);
      } finally {
        setBusy(false);
      }
    },
    [busy, enterResult, message, mode, stopCamera]
  );

  const requestPreview = useCallback(
    (nextTitle: string, nextTheme: DoodleThemeId, nextTemplate: DoodleTemplateId) => {
      const settings = portraitRef.current;
      setShareInfo(current => current ? { ...current, dirty: true } : current);
      previewRef.current?.request(
        () => drawPoster(nextTitle, nextTheme, nextTemplate, qrImageRef.current, settings),
        blob => {
          publishResult(blob);
          queueReviewUpdate(blob, nextTitle.trim() || '今日限定角色', nextTheme, nextTemplate);
          try { localStorage.setItem('neon:portrait-settings:v1', JSON.stringify(settings)); } catch { /* Optional. */ }
        }
      );
    },
    [drawPoster, publishResult, queueReviewUpdate]
  );

  const changeTitle = useCallback(() => {
    const next = randomTitle(title);
    setTitle(next); requestPreview(next, themeId, templateId);
  }, [requestPreview, templateId, themeId, title]);

  const changeTheme = useCallback(
    (next: DoodleThemeId) => {
      setThemeId(next); requestPreview(title, next, templateId);
    },
    [requestPreview, templateId, title]
  );

  const changeTemplate = useCallback(
    (next: DoodleTemplateId) => {
      setTemplateId(next); requestPreview(title, themeId, next);
    },
    [requestPreview, themeId, title]
  );

  const updatePortrait = (next: PortraitSettings, nextTitle: string) => {
    const normalized = normalizePortrait(next);
    portraitRef.current = normalized;
    setPortrait(normalized); setTitle(nextTitle.slice(0, 24));
    requestPreview(nextTitle.slice(0, 24), themeId, templateId);
  };

  const surprisePortrait = () => {
    const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
    const next = normalizePortrait({ ...portraitRef.current, faceEffect: pick(FACE_EFFECTS).id, sticker: pick(STICKERS.slice(1)).id, stickerColor: pick(STICKER_COLORS), mood: pick(MOODS), stickerScale: 1, stickerY: 0, stickerRotation: 0, decoration: pick(['spark', 'hearts', 'orbit'] as const) });
    const nextTitle = randomTitle(title), nextTheme = pick(DOODLE_THEMES).id, nextTemplate = pick(DOODLE_TEMPLATES).id;
    portraitRef.current = next;
    setPortrait(next); setTitle(nextTitle); setThemeId(nextTheme); setTemplateId(nextTemplate);
    requestPreview(nextTitle, nextTheme, nextTemplate);
  };

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

  const saveImage = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await previewRef.current?.flush() || resultBlob;
      if (!blob) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `漫游相机-${title || '今日限定角色'}-${new Date().toISOString().slice(0, 10)}.jpg`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      message.success('图片已开始保存');
    } catch { message.error('图片保存失败，请重试'); } finally { setBusy(false); }
  }, [busy, message, resultBlob, title]);

  const publishShare = useCallback(async () => {
    if (!resultBlob || busy) return;
    setBusy(true);
    try {
      const latestBlob = await previewRef.current?.flush() || resultBlob;
      const cardTitle = title.trim() || '今日限定角色';
      let current = shareInfo;
      if (!current) {
        const created = await createDoodleShare(latestBlob, cardTitle, themeId, templateId, reviewContextRef.current?.key || '');
        current = { record: created.share, url: created.shareUrl, dirty: false };
        setShareInfo(current);
        await waitForPaint();
      }
      const qrImage = await readQrImage(qrHolderRef.current);
      qrImageRef.current = qrImage;
      const finalBlob = await renderResult(cardTitle, themeId, templateId, qrImage);
      queueReviewUpdate(finalBlob, cardTitle, themeId, templateId, current.record.id);
      const updated = await updateDoodleShare(current.record.id, finalBlob, cardTitle, themeId, templateId);
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
        qrImageRef.current = null;
        setShareInfo(null);
        const processed = await renderResult(title, themeId, templateId, null);
        queueReviewUpdate(processed, title, themeId, templateId, shareInfo.record.id);
        message.success('分享链接和公开副本已删除');
      }
    });
  }, [message, modal, queueReviewUpdate, renderResult, shareInfo, templateId, themeId, title]);

  const retake = useCallback(() => {
    previewRef.current?.cancel();
    qrImageRef.current = null;
    analysisRef.current?.renderer?.dispose(); analysisRef.current = null; setAnalysis(null);
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
    <main className="app-page doodle-page bg-[#fffaf0] text-[#201a17] dark:bg-[#17110f] dark:text-[#fff8ee]">
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          void selectAlbumImage(input.files?.[0]).finally(() => {
            input.value = '';
          });
        }}
      />
      <TopBar middle="漫游相机" position="sticky" right={<ThemeToggle />} />

      <div className="app-content-width py-6 sm:py-8">
        {mode === 'welcome' && (
          <section className="grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#ff7ba8]/25 px-4 py-2 text-sm font-bold text-foreground">
                <StarFilled /> 今日角色随机派送
              </div>
              <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
                今天，你是
                <span className="relative mx-2 inline-block -rotate-2 text-[#ff5d46] dark:text-[#ff8b78]">什么角色？</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-[#554943] dark:text-[#d9c8bd]">
                拍一张自拍，或从相册选一张照片。戴上立体猫耳、软糖熊和小星球，调出喜欢的光感，再写一句今天的宣言。你的角色，由你定义。
              </p>
              {cameraError && <div className="mt-5 rounded-2xl bg-[#fff0c9] p-4 font-bold text-[#8a3f21]">{cameraError}</div>}
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => void startCamera()} className="doodle-primary-button">
                  <CameraOutlined /> 打开相机
                </button>
                <button type="button" onClick={openAlbum} className="doodle-secondary-button">
                  <PictureOutlined /> 从相册选择
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-[#665750] dark:text-[#ccb9ad]">
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />端侧漫画处理</span>
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />一键保存海报</span>
                <span><CheckCircleFilled className="mr-2 text-[#15966a]" />分享可随时销毁</span>
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
            <div className="relative mx-auto aspect-[3/4] max-h-[68vh] overflow-hidden rounded-[28px] border border-border bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
              <div className="pointer-events-none absolute inset-[11%_14%_18%] rounded-[48%] border-4 border-dashed border-white/90 shadow-[0_0_0_999px_rgba(18,12,10,0.2)]" />
              {countdown > 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-[10rem] font-black text-white drop-shadow-[8px_8px_0_#201a17]">{countdown}</div>}
              <button type="button" onClick={() => smileState !== 'ready' && toggleSmileShutter()} className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs font-black text-[#201a17]">
                {smileState === 'loading' ? <LoadingOutlined /> : <SmileOutlined />}
                {smileState === 'ready' ? '微笑快门已就绪' : smileState === 'loading' ? '正在加载微笑快门' : '手动快门模式'}
              </button>
            </div>
            <div className="mt-7 flex items-center justify-center gap-5">
              <button onClick={() => void captureVideo()} aria-label="拍照" className="doodle-shutter"><span /></button>
              <button type="button" onClick={toggleSmileShutter} className="flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-[#201a17] transition hover:-translate-y-0.5">
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
            <p className="mt-3 font-semibold text-[#665750] dark:text-[#ccb9ad]">寻找五官与人物轮廓，为你的新角色准备配件</p>
          </section>
        )}

        {mode === 'result' && resultUrl && (
          <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="mx-auto w-full max-w-[620px] lg:sticky lg:top-24 lg:max-w-[min(620px,calc((100vh-170px)*0.75))]">
              <div className="relative overflow-hidden rounded-[28px] border-[6px] border-[#201a17] bg-white shadow-[12px_12px_0_#201a17]">
                <ImagePreview images={[{ id: 'result', url: resultUrl, name: title }]} imageId="result" title="漫游相机" className={`w-full ${previewRef.current?.pending || busy ? 'pointer-events-none' : ''}`}>
                  <NextImage src={resultUrl} alt={`漫画涂鸦：${title}`} width={1080} height={1440} unoptimized className="doodle-result-image block h-auto w-full" onLoad={event => { if (event.currentTarget.src === resultUrlRef.current && !previewRef.current?.pending && previewCanvasRef.current) previewCanvasRef.current.style.opacity = '0'; }} />
                </ImagePreview>
                <canvas ref={previewCanvasRef} aria-hidden="true" className="doodle-live-preview pointer-events-none absolute inset-0 h-full w-full opacity-0" />
              </div>
              <p className="mt-5 text-center text-sm font-bold text-[#75645c] dark:text-[#cbb9ae]">长按图片保存，或在卡片设置中点击保存</p>
            </div>

            <aside className="space-y-5 rounded-2xl border border-border/70 bg-surface/75 p-5">
              <PortraitControls value={portrait} title={title} busy={busy} faceCount={analysis?.faceCount || 0} segmented={analysis?.segmented || false} available={Boolean(analysis?.renderer)} hint={analysis?.message || ''} onChange={updatePortrait} onSurprise={surprisePortrait} />
              <div className="py-2 text-foreground">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground-muted">DESIGN YOUR CARD</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#fff0b8] px-4 py-3 text-[#201a17]">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black text-[#806f65]">当前称号</span>
                    <p className="truncate text-base font-black">{title}</p>
                  </div>
                  <button onClick={changeTitle} disabled={busy} aria-label="换个称号" title="换个称号" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base transition hover:-rotate-12 hover:bg-[#ffe47d] disabled:opacity-50">
                    <ReloadOutlined />
                  </button>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-sm font-black">选择卡片模板</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DOODLE_TEMPLATES.map((template, index) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => changeTemplate(template.id)}
                        disabled={busy}
                        aria-pressed={templateId === template.id}
                        className={`group relative min-h-[68px] overflow-hidden rounded-xl px-3 py-2 text-left text-[#201a17] transition hover:-translate-y-0.5 disabled:opacity-50 ${templateId === template.id ? 'bg-[#fff0b8] ring-2 ring-inset ring-[#c29326]/70' : 'bg-[#fffaf0] hover:bg-[#fff0b8]/70'}`}
                      >
                        <span className="absolute right-2 top-1 text-lg font-black text-[#201a17]/10 transition group-hover:rotate-6 group-hover:text-[#201a17]/20">{String(index + 1).padStart(2, '0')}</span>
                        <span className="block text-sm font-black">{template.name}</span>
                        <span className="mt-1 block max-w-[85%] text-[10px] font-bold leading-4 text-[#806f65]">{template.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-sm font-black">换一套宇宙配色</p>
                  <div className="grid grid-cols-8 gap-2">
                    {DOODLE_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => changeTheme(theme.id)}
                        disabled={busy}
                        aria-label={theme.name}
                        aria-pressed={themeId === theme.id}
                        title={theme.name}
                        className={`aspect-square rounded-xl transition hover:-translate-y-1 ${themeId === theme.id ? 'ring-2 ring-foreground/50 ring-offset-2 ring-offset-background' : ''}`}
                        style={{ background: `linear-gradient(135deg, ${theme.primary} 0 50%, ${theme.secondary} 50%)` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border/60 pt-5 text-foreground">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">保存与分享</h2>
                    <p className="mt-1 text-xs font-bold opacity-70">分享链接会额外生成公开副本，有效 30 天</p>
                  </div>
                  <QrcodeOutlined className="text-3xl" />
                </div>
                <div className="mt-5 grid gap-3">
                  <Button size="large" icon={<DownloadOutlined />} onClick={() => void saveImage()} disabled={busy} block className="!h-10 !border-border !font-semibold !shadow-none">保存图片</Button>
                  <Button type="primary" size="large" icon={busy ? <LoadingOutlined /> : <ShareAltOutlined />} onClick={() => void publishShare()} disabled={busy} block className="!h-10 !border-0 !bg-[#ff5d46] !font-semibold !shadow-none">
                    {shareInfo ? (shareInfo.dirty ? '更新分享卡' : '重新同步分享卡') : '生成分享链接'}
                  </Button>
                </div>

                {shareInfo && (
                  <div className="mt-5 rounded-2xl bg-white p-4">
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

              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={retake} disabled={busy} className="doodle-secondary-button w-full justify-center"><CameraOutlined /> 重新拍一张</button>
                <button type="button" onClick={openAlbum} disabled={busy} className="doodle-secondary-button w-full justify-center disabled:opacity-50"><PictureOutlined /> 从相册换一张</button>
              </div>
            </aside>
          </section>
        )}
      </div>

      {busy && mode === 'result' && <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/15 backdrop-blur-[2px]"><div className="rounded-2xl bg-surface px-6 py-4 text-lg font-semibold text-foreground shadow-lg"><LoadingOutlined spin className="mr-3" />正在施展涂鸦魔法</div></div>}
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
