'use client';

import { CloseOutlined, DesktopOutlined, EditOutlined, FileOutlined } from '@ant-design/icons';
import { useLayoutEffect, useRef } from 'react';
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
  return <aside className="call-share-menu" aria-label="共享内容">
    <header><h3>与大家共享</h3><button type="button" aria-label="关闭共享菜单" onClick={onClose}><CloseOutlined /></button></header>
    <button type="button" disabled={!screenAvailable || view.shareBusy || !!view.presentation} onClick={() => { void session.startScreen(); onClose(); }}><DesktopOutlined /><span>共享屏幕<small>{screenAvailable ? '选择一个窗口、标签页或整个屏幕' : '此浏览器支持观看，请用桌面浏览器发起'}</small></span></button>
    <button type="button" disabled={view.shareBusy || !!view.presentation} onClick={() => { void session.startWhiteboard(); onClose(); }}><EditOutlined /><span>共享白板<small>一起绘画、输入文字</small></span></button>
    <button type="button" disabled={view.shareBusy || !!view.presentation} onClick={() => input.current?.click()}><FileOutlined /><span>共享图片或文档<small>图片、PDF、PPT、LOG、Markdown、HTML</small></span></button>
    <input ref={input} type="file" hidden aria-label="选择共享文件" accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.ppt,.pptx,.log,.txt,.md,.markdown,.html,.htm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { void session.shareFile(file); onClose(); } }} />
    <p>文件最大 20 MB，文本最大 2 MB。{!view.shareCapabilities.powerPoint && '此服务器未启用 PPT 转换，请先导出为 PDF。'}</p>
  </aside>;
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
  const name = view.call?.participants.find(member => member.peerId === presentation.ownerId)?.name || '伙伴';
  return <div className="call-sharing-stage" aria-label="共享演示">
    <header className="call-sharing-heading"><div><strong>{presentation.kind === 'whiteboard' ? '协作白板' : presentation.kind === 'screen' ? '屏幕共享' : presentation.file?.name}</strong><span>{presentation.kind === 'whiteboard' ? '所有参会者均可绘画和输入文字' : `${owner ? '你' : name}正在共享`}</span></div>{owner && <button type="button" onClick={() => void session.stopSharing()}>结束共享</button>}</header>
    {presentation.kind === 'screen' && <Screen stream={owner ? view.screenStream : view.peers[presentation.ownerId]?.screenStream} />}
    {presentation.kind === 'whiteboard' && <SharedWhiteboard key={presentation.id} presentation={presentation} session={session} selfId={view.selfId} />}
    {presentation.kind === 'resource' && (owner && !presentation.ready ? <div className="call-share-loading" role="status"><p>{view.shareProgress < 100 ? '正在上传文件…' : /pptx?$/i.test(presentation.file!.extension) ? '上传完成，正在转换幻灯片，请稍候…' : '上传完成，正在准备预览…'}</p><progress max={100} value={view.shareProgress} aria-label="共享文件上传进度" /><span>{view.shareProgress}%</span></div> : <SharedResource key={presentation.id} presentation={presentation} session={session} owner={owner} />)}
  </div>;
}
