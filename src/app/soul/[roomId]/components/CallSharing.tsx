'use client';

import { DesktopOutlined, EditOutlined, FileOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import dynamic from 'next/dynamic';
import type { CallSession } from '@/modules/webrtc/session';
import type { CallView } from '@/modules/webrtc/types';
import { SharedWhiteboard } from './SharedWhiteboard';
import './call-sharing.css';

const SharedResource = dynamic(() => import('./SharedResource').then(module => module.SharedResource), {
  ssr: false,
  loading: () => <div className="call-share-loading" role="status">正在准备预览…</div>
});

export function ShareMenu({ view, session, onClose }: { view: CallView; session: CallSession; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const screenAvailable = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const canSwitch = !view.presentation || view.presentation.ownerId === view.selfId;
  return <div className="call-share-popover-layer" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="call-share-menu" aria-label="共享内容">
      <header><h3>{view.presentation && canSwitch ? '切换共享' : '共享内容'}</h3></header>
      <div className="call-share-options">
        <button type="button" aria-label="共享屏幕" aria-pressed={view.presentation?.kind === 'screen'} disabled={!screenAvailable || view.shareBusy || !canSwitch} onClick={() => { void session.startScreen(); onClose(); }}><span className="call-share-option-icon"><DesktopOutlined /></span><span>屏幕</span></button>
        <button type="button" aria-label="共享白板" aria-pressed={view.presentation?.kind === 'whiteboard'} disabled={view.shareBusy || !canSwitch} onClick={() => { void session.startWhiteboard(); onClose(); }}><span className="call-share-option-icon"><EditOutlined /></span><span>白板</span></button>
        <button type="button" aria-label="共享文件" aria-pressed={view.presentation?.kind === 'resource'} disabled={view.shareBusy || !canSwitch} onClick={() => input.current?.click()}><span className="call-share-option-icon"><FileOutlined /></span><span>文件</span></button>
      </div>
      <input ref={input} type="file" hidden aria-label="选择共享文件" accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.ppt,.pptx,.log,.txt,.md,.markdown,.html,.htm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { void session.shareFile(file); onClose(); } }} />
    </aside>
  </div>;
}

function ZoomableSurface({ children, whiteboard = false }: { children: ReactNode; whiteboard?: boolean }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number; offset: { x: number; y: number }; point: { x: number; y: number } } | null>(null);
  const clampScale = (value: number) => Math.max(.5, Math.min(3, Math.round(value * 4) / 4));
  const zoom = (value: number) => {
    const next = clampScale(value);
    setScale(next);
    if (next <= 1) setOffset({ x: 0, y: 0 });
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,input,textarea,select,.call-whiteboard-canvas') || event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const values = [...pointers.current.values()];
    if (values.length === 1) gesture.current = { distance: 0, scale, offset, point: values[0] };
    else if (values.length === 2) gesture.current = { distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y), scale, offset, point: { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 } };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 2 && gesture.current.distance > 0) {
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      zoom(gesture.current.scale * distance / gesture.current.distance);
    } else if (values.length === 1 && scale > 1) {
      setOffset({ x: gesture.current.offset.x + values[0].x - gesture.current.point.x, y: gesture.current.offset.y + values[0].y - gesture.current.point.y });
    }
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = null;
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoom(scale + (event.deltaY < 0 ? .25 : -.25));
  };
  return <div className={`call-share-viewport ${scale > 1 ? 'is-zoomed' : ''} ${whiteboard ? 'has-board-toolbar' : ''}`} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onWheel={wheel} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button,input,textarea,select')) zoom(scale === 1 ? 2 : 1); }}>
    <div className="call-share-zoom-controls" aria-label="共享画面缩放">
      <button type="button" aria-label="缩小共享画面" disabled={scale <= .5} onClick={() => zoom(scale - .25)}><MinusOutlined /></button>
      <button type="button" aria-label="恢复共享画面大小" onClick={() => zoom(1)}>{Math.round(scale * 100)}%</button>
      <button type="button" aria-label="放大共享画面" disabled={scale >= 3} onClick={() => zoom(scale + .25)}><PlusOutlined /></button>
    </div>
    <div className="call-share-zoom-content" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}>{children}</div>
  </div>;
}

function Screen({ stream }: { stream?: MediaStream | null }) {
  const video = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream || null;
    if (stream) void element.play().catch(() => undefined);
    return () => { element.pause(); element.srcObject = null; };
  }, [stream]);
  return <video ref={video} muted playsInline autoPlay aria-label="共享屏幕画面" className="call-shared-screen" />;
}

export function SharingStage({ view, session }: { view: CallView; session: CallSession }) {
  const presentation = view.presentation;
  if (!presentation) return null;
  const owner = presentation.ownerId === view.selfId;
  return <div className="call-sharing-stage" aria-label="共享演示">
    <header className="call-sharing-heading"><strong>{presentation.kind === 'whiteboard' ? '协作白板' : presentation.kind === 'screen' ? '屏幕共享' : presentation.file?.name}</strong>{owner && <button type="button" onClick={() => void session.stopSharing()}>结束共享</button>}</header>
    <ZoomableSurface whiteboard={presentation.kind === 'whiteboard'}>
      {presentation.kind === 'screen' && <Screen stream={owner ? view.screenStream : view.peers[presentation.ownerId]?.screenStream} />}
      {presentation.kind === 'whiteboard' && <SharedWhiteboard key={presentation.id} presentation={presentation} session={session} selfId={view.selfId} />}
      {presentation.kind === 'resource' && (owner && !presentation.ready ? <div className="call-share-loading" role="status"><progress max={100} value={view.shareProgress} aria-label="共享文件上传进度" /><span>{view.shareProgress}%</span></div> : <SharedResource key={presentation.id} presentation={presentation} session={session} owner={owner} />)}
    </ZoomableSurface>
  </div>;
}
