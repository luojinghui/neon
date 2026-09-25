'use client';

import { useEffect, useRef } from 'react';

/** Meter the existing microphone track without capturing or playing any audio. */
export function MicrophoneLevel({ stream }: { stream: MediaStream | null }) {
  const fill = useRef<SVGRectElement>(null);
  const track = stream?.getAudioTracks()[0];
  useEffect(() => {
    if (!track || track.readyState !== 'live') return;
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    let frame = 0;
    let level = 0;
    const reset = () => { fill.current?.setAttribute('height', '0'); };
    try {
      context = new AudioContext();
      source = context.createMediaStreamSource(new MediaStream([track]));
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      void context.resume().catch(() => undefined);
      const samples = new Float32Array(analyser.fftSize);
      const update = () => {
        if (track.readyState !== 'live') { reset(); return; }
        analyser!.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const target = track.enabled && !track.muted ? Math.min(1, Math.max(0, (rms - 0.008) * 6)) : 0;
        level += (target - level) * (target > level ? 0.55 : 0.18);
        const height = level * 10;
        fill.current?.setAttribute('y', String(13 - height));
        fill.current?.setAttribute('height', String(height));
        frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    } catch { /* The microphone remains usable if Web Audio is unavailable. */ }
    return () => {
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
      reset();
    };
  }, [track]);
  return <svg className="soul-call-microphone" viewBox="0 0 24 24" aria-hidden="true">
    <rect ref={fill} className="soul-call-microphone-level" x="9" y="13" width="6" height="0" rx="2" />
    <rect x="8" y="2" width="8" height="13" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}
