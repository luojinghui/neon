'use client';

import { AudioMutedOutlined, AudioOutlined, CloseOutlined, ExpandOutlined, LoadingOutlined, PhoneOutlined, SettingOutlined, ShrinkOutlined, SwapOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isMobileDevice } from '@/modules/webrtc/media';
import { CallSession } from '@/modules/webrtc/session';
import type { CallMode, CallParticipant, CallView, PeerView } from '@/modules/webrtc/types';
import { soulChat } from '../../core';
import { CallEffectsPanel } from './CallEffectsPanel';
import './room-call.css';

interface CallContextValue {
  session: CallSession | null;
  view: CallView | null;
  start: (mode: CallMode) => void;
  expand: () => void;
}
const CallContext = createContext<CallContextValue>({ session: null, view: null, start: () => undefined, expand: () => undefined });

export function RoomCallProvider({ roomId, roomName, ready, children }: { roomId: string; roomName: string; ready: boolean; children: ReactNode }) {
  const [session, setSession] = useState<CallSession | null>(null);
  const [view, setView] = useState<CallView | null>(null);
  const [mini, setMini] = useState(false);
  const [permission, setPermission] = useState<CallMode | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => { setMobile(isMobileDevice()); }, []);
  useEffect(() => {
    if (!ready) return;
    const active = new CallSession(roomId, soulChat.getCallTransport());
    setSession(active);
    setView(active.getSnapshot());
    const unsubscribe = active.subscribe(() => setView(active.getSnapshot()));
    void active.connect();
    const pagehide = () => active.hangup();
    window.addEventListener('pagehide', pagehide);
    return () => {
      unsubscribe(); active.dispose();
      window.removeEventListener('pagehide', pagehide);
      setSession(null); setView(null); setPermission(null);
    };
  }, [roomId, ready]);

  const expand = useCallback(() => setMini(false), []);
  const start = (mode: CallMode) => {
    if (!session) return;
    if (view?.phase !== 'idle') { expand(); return; }
    if (mobile) setPermission(mode);
    else { setMini(false); void session.join(mode); }
  };
  const toggleCamera = () => { void session?.toggleDevice('video'); };
  const active = view && view.phase !== 'idle';

  return (
    <CallContext.Provider value={{ session, view, start, expand }}>
      {children}
      {active && session && createPortal(<CallOverlay view={view} session={session} roomName={roomName} mini={mini} onMini={setMini} onCamera={toggleCamera} mobile={mobile} />, document.body)}
      <Modal title="允许通话权限" open={permission !== null} onCancel={() => setPermission(null)} footer={null} centered width={340} destroyOnHidden>
        <div className="space-y-4 pt-2">
          <p className="text-sm leading-6 text-foreground-secondary">
            {permission === 'audio' ? '需要麦克风权限，摄像头保持关闭。' : '需要麦克风和摄像头权限。'}请在浏览器弹窗中选择“允许”。
          </p>
          <button type="button" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white" onClick={() => {
            const requested = permission;
            setPermission(null);
            if (requested) { setMini(false); void session?.join(requested); }
          }}>{permission === 'video' ? '开始视频' : '开始语音'}</button>
          <button type="button" onClick={() => setPermission(null)} className="w-full py-1 text-sm text-foreground-muted">取消</button>
        </div>
      </Modal>
    </CallContext.Provider>
  );
}

export function RoomCallButtons() {
  const { session, view, start, expand } = useContext(CallContext);
  const active = view && view.phase !== 'idle';
  const full = Boolean(view?.call && view.call.participants.length >= view.call.maxParticipants);
  const buttonClass = 'flex h-8 w-8 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-active hover:text-primary disabled:opacity-40';
  return <div className="inline-flex shrink-0 items-center gap-1">
    <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
    {active ? <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-primary" onClick={expand}><PhoneOutlined /> 返回通话</button> : <>
      <button type="button" className={buttonClass} disabled={!session || full} onClick={() => start('audio')} aria-label="语音通话" title={full ? '通话已满' : '语音通话'}><PhoneOutlined /></button>
      <button type="button" className={buttonClass} disabled={!session || full} onClick={() => start('video')} aria-label="视频通话" title={full ? '通话已满' : '视频通话'}><VideoCameraOutlined /></button>
    </>}
  </div>;
}

export function RoomCallNotice() {
  const { session, view, start } = useContext(CallContext);
  const [dismissed, setDismissed] = useState('');
  if (!view || view.phase !== 'idle') return null;
  const call = view.call;
  return <>
    {view.error && <div role="status" className="mb-2 flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs leading-5 text-danger"><span className="flex-1">{view.error}</span><button type="button" aria-label="关闭通话提示" onClick={() => session?.clearError()} className="p-2"><CloseOutlined /></button></div>}
    {call && call.id !== dismissed && <div className="soul-call-notice" role="status">
      <div className="soul-call-notice-icon"><PhoneOutlined /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{call.participants[0]?.name || '星球伙伴'}正在通话</p><p className="mt-0.5 text-xs text-foreground-muted">{call.participants.length}/{call.maxParticipants} 人 · 加入时摄像头关闭</p></div>
      <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-40" onClick={() => start('audio')} disabled={call.participants.length >= call.maxParticipants}>{call.participants.length >= call.maxParticipants ? '已满员' : '加入'}</button>
      <button type="button" className="p-2 text-foreground-muted" aria-label="暂不加入通话" onClick={() => setDismissed(call.id)}><CloseOutlined /></button>
    </div>}
  </>;
}

function MediaTile({ participant, stream, state, local, compact, speakingMirror, onFlip, flipBusy, primary, slot, onSelect }: { participant: CallParticipant; stream?: MediaStream | null; state?: PeerView['connectionState']; local?: boolean; compact: boolean; speakingMirror?: boolean; onFlip?: () => void; flipBusy?: boolean; primary: boolean; slot: number; onSelect: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream || null;
    if (stream) void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [stream, participant.cameraEnabled]);
  useEffect(() => {
    const element = audio.current;
    if (!element || local) return;
    element.srcObject = stream || null;
    if (stream) void element.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
    return () => { element.srcObject = null; };
  }, [stream, local]);
  return <div className={`soul-call-tile ${local ? 'is-local' : ''} ${compact ? 'is-compact' : ''} ${primary ? 'is-primary' : 'is-thumbnail'}`} style={{ '--tile-slot': slot } as CSSProperties}>
    <video ref={video} autoPlay playsInline muted aria-label={`${participant.name}的视频`} className={`soul-call-video ${participant.cameraEnabled ? '' : 'is-hidden'} ${speakingMirror ? 'is-mirrored' : ''}`} />
    {!local && <audio ref={audio} autoPlay />}
    {!primary && <button type="button" className="soul-call-select-tile" aria-label={`将${local ? '我的' : participant.name + '的'}画面放大`} onClick={onSelect}><span>放大画面 <ExpandOutlined /></span></button>}
    {!participant.cameraEnabled && <div className="soul-call-person"><div className="soul-call-avatar">{participant.name.slice(0, 1) || '星'}{participant.avatarUrl && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={participant.avatarUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
    )}</div></div>}
    {local && participant.cameraEnabled && onFlip && <button type="button" className="soul-call-flip" aria-label="切换前后摄像头" title="翻转" disabled={flipBusy} onClick={onFlip}><SwapOutlined /></button>}
    <div className="soul-call-tile-caption"><span className="truncate">{participant.name}{local ? '（我）' : ''}</span>{!participant.microphoneEnabled && <AudioMutedOutlined aria-label="麦克风已关闭" />}{!local && state !== 'connected' && <span className="soul-call-peer-state">{state === 'failed' ? '连接失败' : state === 'disconnected' ? '重连中' : '连接中'}</span>}</div>
    {playBlocked && <button type="button" className="soul-call-play" onClick={() => { void audio.current?.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true)); }}>播放声音</button>}
  </div>;
}

function CallOverlay({ view, session, roomName, mini, onMini, onCamera, mobile }: { view: CallView; session: CallSession; roomName: string; mini: boolean; onMini: (value: boolean) => void; onCamera: () => void; mobile: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const joining = view.phase === 'joining';
  const remote = view.call?.participants.filter((member) => member.peerId !== view.selfId) || [];
  const self = view.call?.participants.find((member) => member.peerId === view.selfId);
  const members = [...remote, ...(self ? [self] : [])];
  const primaryPeer = members.some(member => member.peerId === selectedPeer) ? selectedPeer : (remote[0]?.peerId || self?.peerId);
  const thumbnailPeers = members.filter(member => member.peerId !== primaryPeer).map(member => member.peerId);
  const connected = remote.some((member) => view.peers[member.peerId]?.connectionState === 'connected');
  const status = joining ? '准备中' : !remote.length ? '等待加入' : connected ? `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')} · ${remote.length + 1} 人` : '连接中';

  useEffect(() => {
    if (!view.joinedAt) return;
    const update = () => setElapsed(Math.floor((Date.now() - view.joinedAt!) / 1000));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [view.joinedAt]);
  useEffect(() => {
    const reset = () => setPosition(null);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  useEffect(() => {
    if (mini) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, [mini]);

  return <section ref={panel} tabIndex={-1} role={mini ? 'region' : 'dialog'} aria-modal={mini ? undefined : true} aria-label="星球通话" className={`soul-call-panel ${mini ? 'is-mini' : 'is-full'} ${effectsOpen ? 'is-editing' : ''}`} style={mini && position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined} onKeyDown={(event) => {
    if (event.key === 'Escape') { if (effectsOpen) setEffectsOpen(false); else onMini(!mini); }
    if (event.key === 'Tab' && !mini) {
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <header className="soul-call-header" onPointerDown={(event) => {
      if (!mini || (event.target as HTMLElement).closest('button')) return;
      const rect = panel.current!.getBoundingClientRect();
      drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      if (!drag.current || !panel.current) return;
      setPosition({ x: Math.max(8, Math.min(window.innerWidth - panel.current.offsetWidth - 8, drag.current.left + event.clientX - drag.current.x)), y: Math.max(8, Math.min(window.innerHeight - panel.current.offsetHeight - 8, drag.current.top + event.clientY - drag.current.y)) });
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="min-w-0"><p className="soul-call-eyebrow">PLANET CONNECTION</p><h2>{roomName || '星球通话'}</h2><p className="soul-call-status" role="status"><span />{status}</p></div>
      <div className="soul-call-header-actions"><button type="button" className="soul-call-view-button" disabled={joining} aria-label="画面设置" title="画面设置" aria-expanded={effectsOpen} onClick={() => { onMini(false); if (!effectsOpen) setSelectedPeer(view.selfId); setEffectsOpen(open => !open); }}><SettingOutlined /></button><button type="button" className="soul-call-view-button" onClick={() => { setEffectsOpen(false); onMini(!mini); }} aria-label={mini ? '展开通话' : '缩小到聊天室'} title={mini ? '展开通话' : '缩小到聊天室'}>{mini ? <ExpandOutlined /> : <ShrinkOutlined />}</button></div>
    </header>
    <div className={`soul-call-stage ${remote.length > 1 ? 'has-group' : ''} ${remote.length === 0 ? 'is-waiting' : ''}`} style={{ '--call-thumbnail-count': Math.max(1, thumbnailPeers.length) } as CSSProperties}>
      {joining ? <div className="soul-call-waiting"><LoadingOutlined className="text-3xl" aria-label="准备设备" /></div> : <>
        {remote.map((member) => <MediaTile key={member.peerId} participant={member} stream={view.peers[member.peerId]?.stream} state={view.peers[member.peerId]?.connectionState} compact={mini} primary={primaryPeer === member.peerId} slot={thumbnailPeers.indexOf(member.peerId) + 1} onSelect={() => setSelectedPeer(member.peerId)} />)}
        {self && <MediaTile key="local" participant={{ ...self, microphoneEnabled: view.microphoneEnabled, cameraEnabled: view.cameraEnabled }} stream={view.localStream} local compact={mini} primary={primaryPeer === self.peerId} slot={thumbnailPeers.indexOf(self.peerId) + 1} onSelect={() => setSelectedPeer(self.peerId)} speakingMirror={mirrored} flipBusy={view.mediaBusy} onFlip={mobile ? () => { setMirrored(value => !value); void session.toggleDevice('video', true); } : undefined} />}
        {!remote.length && !view.cameraEnabled && <div className="soul-call-waiting"><div className="soul-call-orbit"><span>✦</span></div><h3>在星球的这一端</h3><p>等待伙伴加入，一起接通信号</p></div>}
      </>}
    </div>
    {view.error && <div className="soul-call-error" role="status"><span>{view.error}</span><button type="button" aria-label="关闭通话提示" onClick={session.clearError}><CloseOutlined /></button></div>}
    <footer className="soul-call-footer">
      <div className="soul-call-controls">
        <button type="button" disabled={joining || view.mediaBusy} className={!view.microphoneEnabled ? 'is-off' : ''} aria-label={view.microphoneEnabled ? '关闭麦克风' : '开启麦克风'} aria-pressed={view.microphoneEnabled} onClick={() => void session.toggleDevice('audio')}>{view.microphoneEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}<span>{view.microphoneEnabled ? '麦克风' : '已静音'}</span></button>
        <button type="button" disabled={joining || view.mediaBusy} className={!view.cameraEnabled ? 'is-off' : ''} aria-label={view.cameraEnabled ? '关闭摄像头' : '开启摄像头'} aria-pressed={view.cameraEnabled} onClick={onCamera}><span className="soul-call-camera-icon"><VideoCameraOutlined />{!view.cameraEnabled && <i />}</span><span>视频</span></button>
        <button type="button" className="is-hangup" aria-label={joining ? '取消通话' : '挂断通话'} onClick={session.hangup}><PhoneOutlined /><span>{joining ? '取消' : '挂断'}</span></button>
      </div>
    </footer>
    {view.effectsStatus.phase === 'loading' && !effectsOpen && <div className="soul-call-effect-loading" role="status"><LoadingOutlined /> {view.effectsStatus.progress}%</div>}
    {view.effectsStatus.phase === 'error' && !effectsOpen && <button type="button" className="soul-call-effect-loading" onClick={() => { onMini(false); setEffectsOpen(true); }}>效果未启用</button>}
    {effectsOpen && <CallEffectsPanel value={view.effects} status={view.effectsStatus} cameraEnabled={view.cameraEnabled} onChange={value => session.setEffects(value)} onClose={() => setEffectsOpen(false)} />}
  </section>;
}
