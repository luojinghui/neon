'use client';

import { Button } from '@/components/ui/button';
import { CloseOutlined, DesktopOutlined, EditOutlined, FileOutlined, FullscreenExitOutlined, FullscreenOutlined, MinusOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import dynamic from 'next/dynamic';
import type { CallSession } from '@/modules/webrtc/session';
import type { CallView } from '@/modules/webrtc/types';
import { SharedWhiteboard } from './SharedWhiteboard';
import './call-sharing.css';

const SharedResource = dynamic(() => import('./SharedResource').then(module => module.SharedResource), {
  ssr: false,
  loading: () => <div className="call-share-loading" role="status">正在准备预览…</div>
});

const MAX_SHARE_FILE = 20 * 1024 * 1024;
const MAX_SHARE_TEXT = 2 * 1024 * 1024;
const FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'ppt', 'pptx', 'log', 'txt', 'md', 'markdown', 'html', 'htm'];

function fileProblem(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!FILE_EXTENSIONS.includes(extension)) return '暂不支持该文件类型，可共享图片、PDF、PPT、文本或网页';
  if (file.size < 1) return '文件为空，请重新选择';
  if (file.size > MAX_SHARE_FILE) return '文件超过 20 MB，请压缩后重试';
  if (['log', 'txt', 'md', 'markdown', 'html', 'htm'].includes(extension) && file.size > MAX_SHARE_TEXT) return '文本文件最大支持 2 MB';
  return '';
}

export function ShareMenu({ view, session, onClose }: { view: CallView; session: CallSession; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState('');
  const [dragging, setDragging] = useState(false);
  const screenAvailable = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const canSwitch = !view.presentation || view.presentation.ownerId === view.selfId;
  const sharer = view.presentation && !canSwitch ? view.call?.participants.find(member => member.peerId === view.presentation!.ownerId)?.name || '其他人' : '';
  const kind = view.presentation?.kind;
  const choose = (file?: File) => {
    if (!file) return;
    const message = fileProblem(file);
    if (message) { setProblem(message); return; }
    void session.shareFile(file); onClose();
  };
  return <div className="call-share-popover-layer" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={`call-share-menu ${dragging ? 'is-dragging' : ''}`} aria-label="共享内容"
      onDragOver={event => { if (canSwitch && !view.shareBusy) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (canSwitch && !view.shareBusy) choose(event.dataTransfer.files?.[0]); }}>
      <header><h3>{view.presentation && canSwitch ? '切换共享' : '共享内容'}</h3><Button variant="ghost" iconOnly type="button" aria-label="关闭共享菜单" onClick={onClose}><CloseOutlined /></Button></header>
      {sharer && <p className="call-share-notice" role="status">{sharer}正在共享，对方结束后你才能发起共享</p>}
      <div className="call-share-options">
        <Button variant="ghost" type="button" aria-label="共享屏幕" aria-pressed={kind === 'screen'} disabled={!screenAvailable || view.shareBusy || !canSwitch} onClick={() => { void session.startScreen(); onClose(); }}><span className="call-share-option-icon"><DesktopOutlined /></span><span className="call-share-option-title">屏幕</span></Button>
        <Button variant="ghost" type="button" aria-label="共享白板" aria-pressed={kind === 'whiteboard'} disabled={view.shareBusy || !canSwitch} onClick={() => { void session.startWhiteboard(); onClose(); }}><span className="call-share-option-icon"><EditOutlined /></span><span className="call-share-option-title">白板</span></Button>
        <Button variant="ghost" type="button" aria-label="共享文件" aria-pressed={kind === 'resource'} disabled={view.shareBusy || !canSwitch} onClick={() => { setProblem(''); input.current?.click(); }}><span className="call-share-option-icon"><FileOutlined /></span><span className="call-share-option-title">文件</span></Button>
      </div>
      <p className={`call-share-drop ${problem ? 'is-error' : ''}`} role={problem ? 'alert' : undefined}>{problem || (dragging ? '松开即可共享该文件' : '可拖入文件 · ≤ 20 MB')}</p>
      {view.presentation && !canSwitch ? null : view.presentation && <Button variant="ghost" type="button" className="call-share-stop" onClick={() => { void session.stopSharing(); onClose(); }}><StopOutlined /><span>结束共享</span></Button>}
      <input ref={input} type="file" hidden aria-label="选择共享文件" accept={FILE_EXTENSIONS.map(value => `.${value}`).join(',')} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; choose(file); }} />
    </aside>
  </div>;
}

function ZoomableSurface({ children }: { children: ReactNode }) {
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
    if ((event.target as HTMLElement).closest('button,input,textarea,select') || event.button !== 0) return;
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
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('input,textarea,select')) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale + .25); }
    else if (event.key === '-') { event.preventDefault(); zoom(scale - .25); }
    else if (event.key === '0') { event.preventDefault(); zoom(1); }
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoom(scale + (event.deltaY < 0 ? .25 : -.25));
  };
  return <div className={`call-share-viewport ${scale > 1 ? 'is-zoomed' : ''}`} tabIndex={0} aria-label="共享内容画面，+ / - 缩放，0 恢复" onKeyDown={keydown} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onWheel={wheel} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button,input,textarea,select')) zoom(scale === 1 ? 2 : 1); }}>
    <div className="call-share-zoom-controls" aria-label="共享画面缩放">
      <Button variant="ghost" iconOnly type="button" aria-label="缩小共享画面" disabled={scale <= .5} onClick={() => zoom(scale - .25)}><MinusOutlined /></Button>
      <Button variant="ghost" type="button" aria-label="恢复共享画面大小" onClick={() => zoom(1)}>{Math.round(scale * 100)}%</Button>
      <Button variant="ghost" iconOnly type="button" aria-label="放大共享画面" disabled={scale >= 3} onClick={() => zoom(scale + .25)}><PlusOutlined /></Button>
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
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stage.current?.requestFullscreen?.().catch(() => undefined);
  };
  if (!presentation) return null;
  const owner = presentation.ownerId === view.selfId;
  const ownerName = view.call?.participants.find(member => member.peerId === presentation.ownerId)?.name;
  const title = presentation.kind === 'whiteboard' ? '协作白板' : presentation.kind === 'screen' ? '屏幕共享' : presentation.file?.name;
  return <div ref={stage} className={`call-sharing-stage ${fullscreen ? 'is-fullscreen' : ''}`} aria-label="共享演示">
    <header className="call-sharing-heading"><strong><span aria-hidden="true">{presentation.kind === 'whiteboard' ? <EditOutlined /> : presentation.kind === 'screen' ? <DesktopOutlined /> : <FileOutlined />}</span><span className="call-sharing-title" title={title}>{title}</span><em>{owner ? '你正在共享' : `${ownerName || '对方'}正在共享`}</em></strong>
      <div className="call-sharing-actions">
        {typeof document !== 'undefined' && document.fullscreenEnabled && <Button variant="ghost" iconOnly type="button" aria-label={fullscreen ? '退出全屏' : '全屏查看共享'} title={fullscreen ? '退出全屏' : '全屏查看'} onClick={toggleFullscreen}>{fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}</Button>}
        {owner && <Button variant="ghost" type="button" className="call-sharing-stop" aria-label="结束共享" onClick={() => void session.stopSharing()}><StopOutlined /><span>结束共享</span></Button>}
      </div></header>
    {presentation.kind === 'whiteboard' ? <SharedWhiteboard key={presentation.id} presentation={presentation} session={session} selfId={view.selfId} /> : <ZoomableSurface>
      {presentation.kind === 'screen' && <Screen stream={owner ? view.screenStream : view.peers[presentation.ownerId]?.screenStream} />}
      {presentation.kind === 'resource' && (owner && !presentation.ready ? <div className="call-share-loading" role="status"><progress max={100} value={view.shareProgress} aria-label="共享文件上传进度" /><span>{view.shareProgress}%</span></div> : <SharedResource key={presentation.id} presentation={presentation} session={session} owner={owner} />)}
    </ZoomableSurface>}
  </div>;
}
