'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type Preview = { poster: string; ratio: number; duration: number };
const previews = new Map<string, Preview>();
const emptyPreview: Preview = { poster: '', ratio: 4 / 3, duration: 0 };

// Reuse small thumbnails between the feed, profile gallery and detail view.
// Keep the cache bounded: full-resolution video frames can be very large.
export function useVideoPreview(videoRef: RefObject<HTMLVideoElement | null>, src: string, poster = '') {
  const [preview, setPreview] = useState<Preview>(emptyPreview);
  const playbackRequested = useRef(false);

  const load = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.getAttribute('src')) return;
    // Keep the resource URL intact; seek after metadata to decode the cover.
    // Some WebKit media backends reject otherwise valid URLs with a #t fragment.
    video.src = src;
    video.load();
  }, [src, videoRef]);

  const preparePlayback = () => {
    playbackRequested.current = true;
    load();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    playbackRequested.current = false;
    let current = previews.get(src) || emptyPreview;
    let captured = Boolean(poster || current.poster);
    setPreview(current);

    const remember = () => {
      if (src.startsWith('blob:')) return;
      previews.delete(src);
      previews.set(src, current);
      if (previews.size > 32) previews.delete(previews.keys().next().value!);
    };
    const metadata = () => {
      current = {
        ...current,
        ratio: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : current.ratio,
        duration: Number.isFinite(video.duration) ? video.duration : 0
      };
      setPreview(current);
      remember();
      // Seeking while paused loads a real frame without autoplaying or emitting sound.
      if (!captured && !playbackRequested.current && video.paused && current.duration > 0) {
        try { video.currentTime = Math.min(0.1, current.duration / 2); } catch { /* Some WebViews defer seeking until playback. */ }
      }
    };
    const capture = () => {
      if (captured || video.seeking || video.readyState < 2 || !video.videoWidth) return;
      captured = true;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        current = { ...current, poster: canvas.toDataURL('image/jpeg', 0.8) };
        setPreview(current);
        remember();
      } catch {
        // Cross-origin videos without CORS remain playable; keep their decoded frame.
      }
    };

    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('durationchange', metadata);
    video.addEventListener('loadeddata', capture);
    video.addEventListener('seeked', capture);
    if (video.readyState >= 1) metadata();
    capture();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { load(); observer?.disconnect(); }
    }, { rootMargin: '240px' });
    if (observer) observer.observe(video);
    else load();

    return () => {
      observer?.disconnect();
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('durationchange', metadata);
      video.removeEventListener('loadeddata', capture);
      video.removeEventListener('seeked', capture);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [load, poster, src, videoRef]);

  return { ...preview, poster: poster || preview.poster, preparePlayback };
}

export function formatVideoTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
