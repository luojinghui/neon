'use client';

import { FullscreenExitOutlined, FullscreenOutlined, LoadingOutlined, MutedOutlined, PauseOutlined, CaretRightFilled, ReloadOutlined, SoundOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { formatVideoTime, useVideoPreview } from './useVideoPreview';
import './video-player.css';

type Props = { src: string; poster?: string; label?: string; className?: string };
type WebKitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitExitFullscreen?: () => void };
const PLAY_EVENT = 'neon-video-play';

// A new source gets its own playback state, including when a feed item is refreshed.
export function VideoPlayer(props: Props) {
  return <Player key={props.src} {...props} />;
}

function Player({ src, poster, label = '视频', className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const { poster: cover, ratio, duration, preparePlayback } = useVideoPreview(videoRef, src, poster);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const pauseOther = (event: Event) => { if ((event as CustomEvent).detail !== video) video?.pause(); };
    const onVisibility = () => { if (document.hidden) video?.pause(); };
    const onFullscreen = () => setFullscreen(document.fullscreenElement === rootRef.current);
    const onNativeEnter = () => setFullscreen(true);
    const onNativeExit = () => setFullscreen(false);
    document.addEventListener(PLAY_EVENT, pauseOther);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    video?.addEventListener('webkitbeginfullscreen', onNativeEnter);
    video?.addEventListener('webkitendfullscreen', onNativeExit);
    return () => {
      document.removeEventListener(PLAY_EVENT, pauseOther);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      video?.removeEventListener('webkitbeginfullscreen', onNativeEnter);
      video?.removeEventListener('webkitendfullscreen', onNativeExit);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const fullscreenButton = fullscreenButtonRef.current;
    document.body.style.overflow = 'hidden';
    fullscreenButton?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey, true);
      fullscreenButton?.focus();
    };
  }, [expanded]);

  const play = async () => {
    const video = videoRef.current;
    if (!video) return;
    preparePlayback();
    if (video.error) video.load();
    if (!started || video.ended) {
      try { video.currentTime = 0; } catch { /* Metadata may still be loading. */ }
    }
    setError('');
    setWaiting(true);
    try {
      // Keep play() in the user gesture for mobile browsers and installed PWAs.
      await video.play();
    } catch (playError) {
      if (playError instanceof DOMException && playError.name === 'AbortError') return;
      setWaiting(false);
      setError(video.error ? '视频无法播放，请重试或打开原视频' : '播放未能开始，请点击重试');
    }
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void play();
    else video.pause();
  };
  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const next = Math.max(0, Math.min(duration, value));
    try { video.currentTime = next; setTime(next); } catch { /* Not yet seekable. */ }
  };
  const toggleFullscreen = async () => {
    const root = rootRef.current;
    const video = videoRef.current as WebKitVideo | null;
    if (!root || !video) return;
    if (expanded) { setExpanded(false); return; }
    if (document.fullscreenElement === root) { await document.exitFullscreen().catch(() => {}); return; }
    if (fullscreen && video.webkitExitFullscreen) { video.webkitExitFullscreen(); return; }
    try {
      if (root.requestFullscreen && document.fullscreenEnabled) { await root.requestFullscreen(); return; }
      if (video.webkitEnterFullscreen && video.readyState >= 1) { video.webkitEnterFullscreen(); return; }
    } catch { /* Embedded browsers may disable the native fullscreen API. */ }
    setExpanded(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); seek(time + (event.key === 'ArrowRight' ? 5 : -5));
    }
  };

  return (
    <div ref={rootRef} className={`video-player${started ? ' is-started' : ''}${expanded ? ' is-expanded' : ''} ${className}`} style={{ '--video-ratio': ratio } as CSSProperties} role={expanded ? 'dialog' : 'region'} aria-modal={expanded || undefined} aria-label={label} onKeyDown={onKeyDown}>
      <video
        ref={videoRef}
        className="video-player-media"
        poster={cover || undefined}
        playsInline
        webkit-playsinline="true"
        x5-playsinline="true"
        preload="metadata"
        aria-label={label}
        onPlay={() => { setStarted(true); setPlaying(true); setError(''); document.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: videoRef.current })); }}
        onPlaying={() => setWaiting(false)}
        onPause={() => { setPlaying(false); setWaiting(false); }}
        onEnded={() => { setPlaying(false); setWaiting(false); }}
        onWaiting={() => { if (started) setWaiting(true); }}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onError={() => { setWaiting(false); setPlaying(false); setError('视频无法加载，请重试或打开原视频'); }}
      />
      {!started && cover && /* eslint-disable-next-line @next/next/no-img-element */
        <img className="video-player-poster" src={cover} alt="" aria-hidden="true" />}
      {!error && <button type="button" className="video-player-surface" aria-label={playing ? '暂停视频' : '播放视频'} onClick={togglePlayback}>
        {(!playing || waiting) && <span className="video-player-play" aria-hidden="true">{waiting ? <LoadingOutlined spin /> : <CaretRightFilled />}</span>}
      </button>}
      {!started && !error && duration > 0 && <span className="video-player-duration">{formatVideoTime(duration)}</span>}
      {error && <div className="video-player-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void play()}><ReloadOutlined />重试</button>
        <a href={src} target="_blank" rel="noopener noreferrer">打开原视频</a>
      </div>}
      <div className="video-player-controls" data-visible={started || expanded || fullscreen}>
        {started && <input className="video-player-seek" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration)} disabled={!duration} aria-label="视频播放进度" aria-valuetext={`${formatVideoTime(time)} / ${formatVideoTime(duration)}`} onChange={(event) => seek(Number(event.target.value))} style={{ '--video-progress': `${duration ? Math.min(100, time / duration * 100) : 0}%` } as CSSProperties} />}
        <div className="video-player-toolbar">
          {started && <>
            <button type="button" aria-label={playing ? '暂停' : '继续播放'} onClick={togglePlayback}>{playing ? <PauseOutlined /> : <CaretRightFilled />}</button>
            <span className="video-player-time">{formatVideoTime(time)} / {formatVideoTime(duration)}</span>
            <button type="button" aria-label={muted ? '开启声音' : '静音'} aria-pressed={muted} onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}>{muted ? <MutedOutlined /> : <SoundOutlined />}</button>
          </>}
          <button ref={fullscreenButtonRef} type="button" className="video-player-fullscreen" aria-label={fullscreen || expanded ? '退出全屏' : '全屏播放'} onClick={() => void toggleFullscreen()}>{fullscreen || expanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}</button>
        </div>
      </div>
    </div>
  );
}

export function VideoCover({ src, poster, className }: Pick<Props, 'src' | 'poster' | 'className'>) {
  return <Cover key={src} src={src} poster={poster} className={className} />;
}

function Cover({ src, poster, className }: Pick<Props, 'src' | 'poster' | 'className'>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const preview = useVideoPreview(videoRef, src, poster);
  return <video ref={videoRef} className={className} poster={preview.poster || undefined} muted playsInline webkit-playsinline="true" preload="metadata" aria-hidden="true" />;
}
