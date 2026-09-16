'use client';

import { CaretRightFilled, LoadingOutlined, PauseOutlined, RedoOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MomentVoice } from '../types';
import { formatVoiceDuration } from '../format';
import './MomentVoice.css';

let activeAudio: HTMLAudioElement | null = null;

type Props = { voice: Pick<MomentVoice, 'url' | 'durationMs'> };

export function MomentVoicePlayer({ voice }: Props) {
  // A different source owns its playback state and always starts paused.
  return <VoicePlayer key={voice.url} voice={voice} />;
}

function VoicePlayer({ voice }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackAttemptRef = useRef(0);
  const playbackRequestedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fallbackDuration = Number.isFinite(voice.durationMs) ? Math.max(0, voice.durationMs / 1000) : 0;
  const totalDuration = duration || fallbackDuration;
  const progress = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const pauseAction = playing || loading;

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      playbackAttemptRef.current += 1;
      playbackRequestedRef.current = false;
      audio?.pause();
      if (activeAudio === audio) activeAudio = null;
    };
  }, []);

  const updateDuration = () => {
    const next = audioRef.current?.duration;
    if (next && Number.isFinite(next)) setDuration(next);
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!error && (playbackRequestedRef.current || !audio.paused)) {
      playbackAttemptRef.current += 1;
      playbackRequestedRef.current = false;
      audio.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }

    if (activeAudio && activeAudio !== audio) activeAudio.pause();
    activeAudio = audio;
    const attempt = ++playbackAttemptRef.current;
    if (error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    playbackRequestedRef.current = true;
    setError(false);
    setLoading(true);
    try {
      await audio.play();
    } catch (playError) {
      if (attempt !== playbackAttemptRef.current) return;
      playbackRequestedRef.current = false;
      setLoading(false);
      setPlaying(false);
      if (!(playError instanceof DOMException && playError.name === 'AbortError')) setError(true);
    }
  };

  const stop = () => {
    playbackAttemptRef.current += 1;
    playbackRequestedRef.current = false;
    setPlaying(false);
    setLoading(false);
    if (activeAudio === audioRef.current) activeAudio = null;
  };

  return (
    <div className={`moment-voice-player${error ? ' has-error' : ''}`} role="group" aria-label="心迹语音播放器">
      <audio
        ref={audioRef}
        src={voice.url}
        preload="metadata"
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onPlay={() => {
          const audio = audioRef.current;
          if (!audio || audio.paused) return;
          if (activeAudio && activeAudio !== audio) activeAudio.pause();
          activeAudio = audio;
          setPlaying(true);
        }}
        onPlaying={() => { if (!audioRef.current?.paused) { setPlaying(true); setLoading(false); } }}
        onWaiting={() => { if (!audioRef.current?.paused) setLoading(true); }}
        onCanPlay={() => setLoading(false)}
        onPause={() => { if (audioRef.current?.paused) stop(); }}
        onEnded={() => { stop(); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onError={() => { stop(); setError(true); }}
      />
      <button
        type="button"
        className="moment-voice-toggle"
        onClick={() => void toggle()}
        aria-label={error ? '重试播放语音' : pauseAction ? '暂停语音' : '播放语音'}
        title={error ? '重试播放' : pauseAction ? '暂停' : '播放'}
      >
        {error ? <RedoOutlined /> : loading ? <LoadingOutlined /> : playing ? <PauseOutlined /> : <CaretRightFilled />}
      </button>
      <div className="moment-voice-track">
        <div className="moment-voice-details">
          <span aria-live="polite">{error ? '语音加载失败，点击重试' : loading ? '加载中…' : playing ? '正在播放' : '语音'}</span>
          <span className="moment-voice-time">{formatVoiceDuration(currentTime * 1000)} / {formatVoiceDuration(totalDuration * 1000)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={totalDuration || 1}
          step={0.1}
          value={Math.min(currentTime, totalDuration)}
          disabled={!totalDuration || error}
          aria-label="语音播放进度"
          aria-valuetext={`${formatVoiceDuration(currentTime * 1000)}，共 ${formatVoiceDuration(totalDuration * 1000)}`}
          style={{ '--voice-progress': `${progress}%` } as CSSProperties}
          onChange={(event) => {
            const audio = audioRef.current;
            if (!audio) return;
            const next = Number(event.target.value);
            audio.currentTime = next;
            setCurrentTime(next);
          }}
        />
      </div>
    </div>
  );
}
