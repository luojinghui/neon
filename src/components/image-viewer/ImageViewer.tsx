'use client';

import { AppstoreOutlined, CloseOutlined, LeftOutlined, LoadingOutlined, PictureOutlined, ReloadOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { constrainTransform, INITIAL_TRANSFORM, pinchTransform, swipeDirection, type ImageTransform, type Point } from './image-viewer-gestures';
import './image-viewer.css';

export type ImageViewerItem = { id: string; url: string; name?: string };

type Props = {
  images: ImageViewerItem[];
  currentIndex: number;
  onSelect: (id: string) => void;
  onClose: () => void;
  title?: string;
  variant?: 'photo' | 'sticker';
};

type Gesture = {
  kind: 'swipe' | 'pan' | 'pinch';
  start: Point;
  latest: Point;
  transform: ImageTransform;
  distance: number;
  time: number;
  moved: boolean;
};

function ImageStage({ images, currentIndex, onSelect, variant }: Omit<Props, 'onClose'>) {
  const isSticker = variant === 'sticker';
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const transformRef = useRef(INITIAL_TRANSFORM);
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const pointerType = useRef('');
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const updateTransform = useCallback((next: ImageTransform) => {
    const stage = stageRef.current;
    const img = imageRef.current;
    const bounded = stage && img ? constrainTransform(next, { width: img.offsetWidth, height: img.offsetHeight }, { width: stage.clientWidth, height: stage.clientHeight }) : INITIAL_TRANSFORM;
    transformRef.current = bounded;
    setTransform(bounded);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => updateTransform(transformRef.current));
    observer.observe(stage);
    return () => {
      observer.disconnect();
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [updateTransform]);

  // A cached image can finish loading before React attaches its load listener.
  useEffect(() => {
    if (imageRef.current?.complete) setStatus(imageRef.current.naturalWidth ? 'ready' : 'error');
  }, [attempt]);

  const localPoint = (point: Point) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
  };

  const zoomAt = (point?: Point) => {
    if (status !== 'ready') return;
    const zoom = transformRef.current;
    const anchor = point ? localPoint(point) : { x: 0, y: 0 };
    updateTransform(zoom.scale > 1 ? INITIAL_TRANSFORM : pinchTransform(zoom, anchor, anchor, 2));
  };

  const beginGesture = () => {
    const points = [...pointers.current.values()];
    if (!points.length) { gesture.current = null; return; }
    const two = points.length > 1;
    const point = two ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    gesture.current = {
      kind: two ? 'pinch' : transformRef.current.scale > 1 ? 'pan' : 'swipe',
      start: point, latest: point, transform: transformRef.current,
      distance: two ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      time: performance.now(), moved: two
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isSticker || settling || (event.pointerType === 'mouse' && event.button !== 0) || (event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerType.current = event.pointerType;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
    setOffset(0);
    beginGesture();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = gesture.current;
    const points = [...pointers.current.values()];
    if (active.kind === 'pinch' && points.length > 1) {
      const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (status === 'ready') updateTransform(pinchTransform(active.transform, localPoint(active.start), localPoint(midpoint), distance / Math.max(active.distance, 1)));
      return;
    }
    active.latest = points[0];
    const dx = active.latest.x - active.start.x;
    const dy = active.latest.y - active.start.y;
    if (Math.hypot(dx, dy) > 8) active.moved = true;
    if (active.kind === 'pan') {
      updateTransform({ ...active.transform, x: active.transform.x + dx, y: active.transform.y + dy });
    } else if (Math.abs(dx) > Math.abs(dy)) {
      const atEdge = (dx > 0 && currentIndex === 0) || (dx < 0 && currentIndex === images.length - 1);
      setOffset(dx * (atEdge ? 0.22 : 1));
    }
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return;
    const active = gesture.current;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size) {
      beginGesture();
      // Lifting one finger after a pinch must never turn into a page swipe or tap.
      if (gesture.current) { gesture.current.kind = 'pan'; gesture.current.moved = true; }
      return;
    }
    gesture.current = null;
    setDragging(false);
    if (!active || cancelled) { setOffset(0); return; }
    const dx = event.clientX - active.start.x;
    const dy = event.clientY - active.start.y;
    const direction = active.kind === 'swipe' ? swipeDirection(dx, dy, performance.now() - active.time, stageRef.current!.clientWidth) : 0;
    const next = images[currentIndex + direction];
    if (direction && next) {
      setSettling(true);
      setOffset(-direction * stageRef.current!.clientWidth);
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
      transitionTimer.current = setTimeout(() => onSelect(next.id), duration);
      return;
    }
    setOffset(0);
    if (!active.moved && Math.hypot(dx, dy) < 8 && event.pointerType === 'touch') {
      const now = performance.now();
      if (now - lastTap.current.time < 300 && Math.hypot(event.clientX - lastTap.current.x, event.clientY - lastTap.current.y) < 30) {
        zoomAt({ x: event.clientX, y: event.clientY });
        lastTap.current.time = 0;
      } else lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    } else lastTap.current.time = 0;
  };

  return (
    <div className="image-viewer-canvas">
      <div
        ref={stageRef}
        className={`image-viewer-stage${dragging ? ' is-dragging' : ''}${transform.scale > 1 ? ' is-zoomed' : ''}`}
        aria-label={isSticker ? '表情预览' : '图片区域，左右滑动切换，双击或双指缩放'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPointer(event)}
        onPointerCancel={(event) => endPointer(event, true)}
        onLostPointerCapture={(event) => endPointer(event, true)}
        onDoubleClick={(event) => { if (!isSticker && pointerType.current !== 'touch') zoomAt({ x: event.clientX, y: event.clientY }); }}
      >
        <div className="image-viewer-track" style={{ transform: `translate3d(${offset}px, 0, 0)` }}>
          {[-1, 0, 1].map((relative) => {
            const item = images[currentIndex + relative];
            return (
              <div key={relative} className="image-viewer-slide" style={{ left: `${relative * 100}%` }} aria-hidden={relative !== 0 || undefined}>
                {item && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${item.url}-${relative === 0 ? attempt : 0}`}
                    ref={relative === 0 ? imageRef : undefined}
                    src={item.url}
                    alt={relative === 0 ? item.name || `图片 ${currentIndex + 1}` : ''}
                    draggable={false}
                    className="image-viewer-image"
                    style={relative === 0 ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`, opacity: status === 'ready' ? 1 : 0 } : undefined}
                    onLoad={relative === 0 ? () => setStatus('ready') : undefined}
                    onError={relative === 0 ? () => setStatus('error') : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
        {status === 'loading' && <div className="image-viewer-status" role="status"><LoadingOutlined spin /><span>正在加载原图</span></div>}
        {status === 'error' && <div className="image-viewer-status" role="alert"><PictureOutlined /><span>图片暂时无法加载</span><button type="button" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }}><ReloadOutlined />重新加载</button></div>}
      </div>
      {!isSticker && <div className="image-viewer-zoom" role="group" aria-label="图片缩放">
        <button type="button" aria-label="缩小图片" disabled={transform.scale <= 1 || status !== 'ready'} onClick={() => updateTransform({ ...transformRef.current, scale: transformRef.current.scale - 0.5 })}><ZoomOutOutlined /></button>
        <button type="button" className="image-viewer-scale" aria-label="恢复适合屏幕" disabled={status !== 'ready'} onClick={() => updateTransform(INITIAL_TRANSFORM)}>{Math.round(transform.scale * 100)}%</button>
        <button type="button" aria-label="放大图片" disabled={transform.scale >= 4 || status !== 'ready'} onClick={() => updateTransform({ ...transformRef.current, scale: transformRef.current.scale + 0.5 })}><ZoomInOutlined /></button>
      </div>}
    </div>
  );
}

export function ImageViewer({ images, currentIndex, onSelect, onClose, title = '图片预览', variant = 'photo' }: Props) {
  const isSticker = variant === 'sticker';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [overview, setOverview] = useState(false);
  const current = images[currentIndex];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const htmlOverflow = document.documentElement.style.overflow;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.body.style.paddingRight = bodyPadding;
      document.documentElement.style.overflow = htmlOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Capture Escape before the profile's underlying AntD detail modal sees it.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (overview) setOverview(false); else onClose();
      } else if (!overview && !event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? images.length - 1 : currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
        if (images[index]) onSelect(images[index].id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [currentIndex, images, onClose, onSelect, overview]);

  useEffect(() => {
    const strip = thumbnailsRef.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !selected) return;
    strip.scrollTo({ left: selected.offsetLeft - strip.clientWidth / 2 + selected.clientWidth / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [currentIndex, overview]);

  return createPortal(
    <dialog ref={dialogRef} className={`image-viewer${isSticker ? ' is-sticker' : ''}`} aria-labelledby={headingId} aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      event.stopPropagation();
      if (isSticker && event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }
    }} onKeyDown={(event) => event.stopPropagation()}>
      <header className="image-viewer-header">
        <div className="image-viewer-title"><span id={headingId}>{title}</span>{!isSticker && <span className="image-viewer-counter" aria-live="polite" aria-atomic="true"><b>{currentIndex + 1}</b><span>/</span>{images.length}</span>}</div>
        <button type="button" className="image-viewer-close" aria-label={isSticker ? '关闭表情预览' : '关闭图片预览'} title="关闭 (Esc)" autoFocus onClick={onClose}><CloseOutlined /></button>
      </header>

      {overview ? (
        <div className="image-viewer-overview" role="group" aria-label="全部图片">
          <div className="image-viewer-overview-heading"><h2>全部图片</h2><p>{images.length} 张 · 点击查看大图</p></div>
          <div className="image-viewer-overview-grid">
            {images.map((item, index) => (
              <button key={item.id} type="button" aria-label={`查看第 ${index + 1} 张大图`} aria-current={index === currentIndex ? 'true' : undefined} onClick={() => { onSelect(item.id); setOverview(false); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.name || `图片 ${index + 1}`} loading="lazy" draggable={false} />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="image-viewer-main">
          <ImageStage key={`${current.id}-${current.url}`} images={images} currentIndex={currentIndex} onSelect={onSelect} variant={variant} />
          {images.length > 1 && <>
            <button type="button" className="image-viewer-arrow is-previous" aria-label="上一张图片" title="上一张 (←)" disabled={currentIndex === 0} onClick={() => onSelect(images[currentIndex - 1].id)}><LeftOutlined /></button>
            <button type="button" className="image-viewer-arrow is-next" aria-label="下一张图片" title="下一张 (→)" disabled={currentIndex === images.length - 1} onClick={() => onSelect(images[currentIndex + 1].id)}><RightOutlined /></button>
          </>}
        </div>
      )}

      {isSticker ? <p className="image-viewer-sticker-name">{current.name}</p> : <footer className="image-viewer-footer">
        {!overview && images.length > 1 && (
          <div ref={thumbnailsRef} className="image-viewer-thumbnails" role="group" aria-label="图片快速预览">
            {images.map((item, index) => (
              <button key={item.id} type="button" aria-label={`切换到第 ${index + 1} 张图片`} aria-current={index === currentIndex ? 'true' : undefined} onClick={() => onSelect(item.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" draggable={false} loading="lazy" />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        )}
        {!overview && <p className="image-viewer-mobile-hint">{images.length > 1 ? '左右滑动切换 · ' : ''}双指缩放查看细节</p>}
        <div className="image-viewer-bottom">
          <p className="image-viewer-desktop-hint">{overview ? '点击照片进入大图' : `${images.length > 1 ? '← → 切换 · ' : ''}双击放大 · Esc 关闭`}</p>
          {images.length > 1 && <div className="image-viewer-modes" role="group" aria-label="图片查看模式">
            <button type="button" aria-pressed={!overview} onClick={() => setOverview(false)}><PictureOutlined />大图</button>
            <button type="button" aria-pressed={overview} onClick={() => setOverview(true)}><AppstoreOutlined />总览</button>
          </div>}
          <span className="image-viewer-file-name" title={current.name}>{current.name}</span>
        </div>
      </footer>}
    </dialog>,
    document.body
  );
}
