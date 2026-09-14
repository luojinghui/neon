'use client';

import { AudioOutlined, DeleteOutlined, EnvironmentOutlined, LoadingOutlined, PictureOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { createMoment } from '../client';
import { formatVoiceDuration } from '../format';
import type { Moment, MomentLocation } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  onPublished: (moment: Moment) => void;
};

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return <div className="moment-file-preview-loading"><LoadingOutlined /></div>;
  return file.type.startsWith('video/') ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt={file.name} />; // eslint-disable-line @next/next/no-img-element
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function MomentComposer({ open, onClose, onPublished }: Props) {
  const [text, setText] = useState('');
  const [media, setMedia] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [location, setLocation] = useState<MomentLocation | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const voiceUrl = useObjectUrl(voice);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const reset = () => {
    setText('');
    setMedia([]);
    setVoice(null);
    setVoiceDurationMs(0);
    setLocation(null);
    setRecording(false);
    setRecordingMs(0);
    setLocating(false);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - recordingStartedAtRef.current;
      setRecordingMs(elapsed);
      if (elapsed >= 5 * 60_000 && recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
  }, []);

  const close = () => {
    if (saving) return;
    discardRecordingRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
    reset();
    onClose();
  };

  const addMedia = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (accepted.length !== files.length) setError('仅支持图片和视频文件');
    setMedia((current) => [...current, ...accepted].slice(0, 9));
    if (currentMediaCount(media.length, accepted.length) > 9) setError('每条心迹最多添加 9 个图片或视频');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持语音录制');
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRecordingRef.current = false;
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingMs(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError('录音失败，请重试');
      recorder.onstop = () => {
        const duration = Math.max(0, Date.now() - recordingStartedAtRef.current);
        const type = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm';
        if (!discardRecordingRef.current && chunksRef.current.length > 0) {
          const extension = type.startsWith('audio/mp4') ? 'm4a' : 'webm';
          const blob = new Blob(chunksRef.current, { type });
          setVoice(new File([blob], `voice-${Date.now()}.${extension}`, { type }));
          setVoiceDurationMs(duration);
        }
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        setRecordingMs(0);
        stopStream();
      };
      recorder.start(250);
      setRecording(true);
    } catch (recordError) {
      stopStream();
      setError(recordError instanceof DOMException && recordError.name === 'NotAllowedError' ? '需要允许麦克风权限才能录制语音' : '暂时无法使用麦克风');
    }
  };

  const locate = () => {
    if (location) {
      setLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      setError('当前浏览器不支持 H5 定位');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        setLocation({ latitude, longitude, label: `当前位置 · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
        setLocating(false);
      },
      (locationError) => {
        setLocating(false);
        setError(locationError.code === locationError.PERMISSION_DENIED ? '需要允许定位权限才能添加位置' : '暂时无法获取当前位置');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const publish = async () => {
    if (saving || recording) return;
    if (!text.trim() && media.length === 0 && !voice) {
      setError('写点文字，或添加图片、视频、语音后再发布');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const moment = await createMoment({ text, media, voice, voiceDurationMs, location });
      reset();
      onPublished(moment);
      onClose();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : '发布失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={close} footer={null} centered destroyOnHidden width={700} title={null} mask={{ closable: !saving }} keyboard={!saving}>
      <div className="moment-composer">
        <header className="moment-composer-head">
          <button type="button" onClick={close} disabled={saving}>取消</button>
          <h2>发布心迹</h2>
          <button type="button" onClick={() => void publish()} disabled={saving || recording}>{saving && <LoadingOutlined />}{saving ? '发布中' : '发布'}</button>
        </header>

        <div className="moment-composer-body">
          <label className="moment-composer-text">
            <span className="sr-only">心迹文字</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={500} rows={5} placeholder="此刻，想说点什么……" autoFocus />
            <span>{text.length}/500</span>
          </label>

          {media.length > 0 && (
            <div className="moment-file-grid">
              {media.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="moment-file-preview">
                  <FilePreview file={file} />
                  <button type="button" onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除${file.name}`}><DeleteOutlined /></button>
                  {file.type.startsWith('video/') && <span><VideoCameraOutlined /> 视频</span>}
                </div>
              ))}
              {media.length < 9 && <button type="button" className="moment-add-file" onClick={() => fileInputRef.current?.click()}><PictureOutlined /><span>继续添加</span></button>}
            </div>
          )}

          {voice && voiceUrl && (
            <div className="moment-voice-draft">
              <span><AudioOutlined /></span>
              <audio src={voiceUrl} controls preload="metadata" />
              <span className="font-mono text-xs text-foreground-muted">{formatVoiceDuration(voiceDurationMs)}</span>
              <button type="button" onClick={() => { setVoice(null); setVoiceDurationMs(0); }} aria-label="删除语音"><DeleteOutlined /></button>
            </div>
          )}

          {recording && (
            <div className="moment-recording" aria-live="polite">
              <span className="moment-recording-dot" />
              <span>正在录音</span>
              <span className="font-mono">{formatVoiceDuration(recordingMs)}</span>
              <button type="button" onClick={() => recorderRef.current?.stop()}><StopOutlined />完成</button>
            </div>
          )}

          {location && (
            <button type="button" className="moment-location-chip" onClick={() => setLocation(null)} title="点击移除位置">
              <EnvironmentOutlined />
              <span>{location.label}</span>
              <DeleteOutlined />
            </button>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(event) => addMedia(event.target.files)} />
          <div className="moment-composer-tools">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={media.length >= 9}><PictureOutlined /><span>图片</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={media.length >= 9}><VideoCameraOutlined /><span>视频</span></button>
            <button type="button" onClick={() => void startRecording()} className={recording ? 'is-active' : ''}><AudioOutlined /><span>{recording ? '停止录音' : voice ? '重新录音' : '语音'}</span></button>
            <button type="button" onClick={locate} className={location ? 'is-active' : ''} disabled={locating}>{locating ? <LoadingOutlined /> : <EnvironmentOutlined />}<span>{locating ? '定位中' : '位置'}</span></button>
          </div>
          <p className="moment-composer-hint">最多 9 个图片或视频；语音最长 5 分钟。位置通过浏览器 H5 定位获取。</p>
          {error && <p className="moment-inline-error" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}

function currentMediaCount(current: number, added: number) {
  return current + added;
}
