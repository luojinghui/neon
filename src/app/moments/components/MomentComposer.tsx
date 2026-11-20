'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AudioOutlined, DeleteOutlined, EnvironmentOutlined, LoadingOutlined, PictureOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { createMoment, importMomentImage, updateMoment } from '../client';
import {
  buildMomentSubmission,
  countDraftInlineImages,
  countDraftTextLength,
  createDraftBlocksFromMoment,
  createEmptyDraftBlocks,
  insertSegmentsIntoBlocks,
  MAX_MOMENT_INLINE_IMAGES,
  MAX_MOMENT_TEXT_LENGTH,
  removeImageBlock,
  type DraftBlock
} from '../blockDraft';
import { formatVoiceDuration } from '../format';
import { parseMomentClipboard, type ParsedPasteSegment } from '../pasteParser';
import type { Moment, MomentLocation, MomentMedia, MomentVoice } from '../types';
import { MomentBlockEditor } from './MomentBlockEditor';
import { MomentVoicePlayer } from './MomentVoice';
import { VideoCover } from '@/components/video-player/VideoPlayer';

const REMOTE_IMPORT_CONCURRENCY = 4;

type Props = {
  appearance?: 'journal';
  open: boolean;
  moment?: Moment | null;
  onClose: () => void;
  onPublished: (moment: Moment) => void;
};

function VideoPreview({ file, src }: { file?: File; src?: string }) {
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setObjectUrl('');
      return;
    }
    const next = URL.createObjectURL(file);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const url = src || objectUrl;
  if (!url) return <div className="moment-file-preview-loading"><LoadingOutlined /></div>;
  return <VideoCover src={url} />;
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

export function MomentComposer({ open, moment: editingMoment = null, onClose, onPublished, appearance }: Props) {
  const isEditing = Boolean(editingMoment);
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => createEmptyDraftBlocks());
  const [existingVideos, setExistingVideos] = useState<MomentMedia[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [existingVoice, setExistingVoice] = useState<MomentVoice | null>(null);
  const [voice, setVoice] = useState<File | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [location, setLocation] = useState<MomentLocation | null>(null);
  const [recording, setRecording] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<{ blockId: string; caret: number } | null>(null);
  const dragDepthRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingRequestIdRef = useRef(0);
  const requestingMicrophoneRef = useRef(false);
  const activeCursorRef = useRef<{ blockId: string; start: number; end: number }>({ blockId: blocks[0].id, start: 0, end: 0 });
  const importControllersRef = useRef<Map<string, AbortController>>(new Map());
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef(0);
  const voiceUrl = useObjectUrl(voice);

  const trackPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    previewUrlsRef.current.add(url);
    return url;
  }, []);

  const revokePreviewUrl = useCallback((url?: string) => {
    if (!url) return;
    if (previewUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(url);
    }
  }, []);

  const cancelAllImports = useCallback(() => {
    importControllersRef.current.forEach((controller) => controller.abort());
    importControllersRef.current.clear();
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const reset = useCallback(() => {
    sessionIdRef.current += 1;
    cancelAllImports();
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
    const initial = createEmptyDraftBlocks();
    setBlocks(initial);
    activeCursorRef.current = { blockId: initial[0].id, start: 0, end: 0 };
    setPendingFocus(null);
    setExistingVideos([]);
    setVideos([]);
    setExistingVoice(null);
    setVoice(null);
    setVoiceDurationMs(0);
    setLocation(null);
    setRecording(false);
    setRequestingMicrophone(false);
    requestingMicrophoneRef.current = false;
    setRecordingMs(0);
    setLocating(false);
    setError('');
    dragDepthRef.current = 0;
    setDragging(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [cancelAllImports]);

  // Hydrate composer state whenever opened in edit mode (or reset for fresh compose).
  useEffect(() => {
    if (!open) return;
    sessionIdRef.current += 1;
    cancelAllImports();
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
    setError('');
    setDragging(false);
    dragDepthRef.current = 0;
    setVideos([]);
    setVoice(null);
    setVoiceDurationMs(0);
    if (editingMoment) {
      const hydrated = createDraftBlocksFromMoment(editingMoment);
      setBlocks(hydrated);
      const firstText = hydrated.find((b) => b.type === 'text');
      const caret = firstText && firstText.type === 'text' ? firstText.text.length : 0;
      activeCursorRef.current = { blockId: firstText?.id || hydrated[0].id, start: caret, end: caret };
      setPendingFocus({ blockId: firstText?.id || hydrated[0].id, caret });
      setExistingVideos((editingMoment.media || []).filter((item) => item.type === 'video'));
      setExistingVoice(editingMoment.voice || null);
      setLocation(editingMoment.location || null);
    } else {
      const initial = createEmptyDraftBlocks();
      setBlocks(initial);
      activeCursorRef.current = { blockId: initial[0].id, start: 0, end: 0 };
      setPendingFocus(null);
      setExistingVideos([]);
      setExistingVoice(null);
      setLocation(null);
    }
  }, [open, editingMoment, cancelAllImports]);

  useEffect(() => () => {
    cancelAllImports();
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, [cancelAllImports]);

  const fetchOneRemoteImage = useCallback(async (blockId: string, url: string, sessionId: number) => {
    const controller = new AbortController();
    importControllersRef.current.set(blockId, controller);
    try {
      const file = await importMomentImage(url, controller.signal);
      if (sessionId !== sessionIdRef.current || controller.signal.aborted) return;
      const previewUrl = trackPreviewUrl(file);
      let attached = false;
      setBlocks((current) =>
        current.map((block) => {
          if (block.id !== blockId || block.type !== 'image') return block;
          attached = true;
          return { ...block, status: 'ready', file, previewUrl, errorMessage: undefined };
        })
      );
      if (!attached) revokePreviewUrl(previewUrl);
    } catch (importError) {
      if (sessionId !== sessionIdRef.current || controller.signal.aborted) return;
      const message = importError instanceof Error ? importError.message : '图片拉取失败，请手动替换';
      setBlocks((current) =>
        current.map((block) =>
          block.id === blockId && block.type === 'image'
            ? { ...block, status: 'error', errorMessage: message }
            : block
        )
      );
    } finally {
      if (importControllersRef.current.get(blockId) === controller) {
        importControllersRef.current.delete(blockId);
      }
    }
  }, [revokePreviewUrl, trackPreviewUrl]);

  const runRemoteImports = useCallback((items: { id: string; url: string }[]) => {
    if (!items.length) return;
    const sessionId = sessionIdRef.current;
    let cursor = 0;
    const workerCount = Math.min(REMOTE_IMPORT_CONCURRENCY, items.length);
    for (let i = 0; i < workerCount; i += 1) {
      void (async () => {
        while (cursor < items.length && sessionId === sessionIdRef.current) {
          const next = items[cursor];
          cursor += 1;
          await fetchOneRemoteImage(next.id, next.url, sessionId);
        }
      })();
    }
  }, [fetchOneRemoteImage]);

  const insertSegments = useCallback((blockId: string, start: number, end: number, segments: ParsedPasteSegment[]) => {
    if (!segments.length) return;
    let pending: { id: string; url: string }[] = [];
    let overflow = 0;
    let focusTarget: { blockId: string; caret: number } | null = null;
    setBlocks((current) => {
      const result = insertSegmentsIntoBlocks(current, blockId, start, end, segments, {
        maxInlineImages: MAX_MOMENT_INLINE_IMAGES,
        createPreviewUrl: trackPreviewUrl
      });
      pending = result.pendingRemoteIds;
      overflow = result.overflowImageCount;
      focusTarget = { blockId: result.focusBlockId, caret: result.focusCaret };
      activeCursorRef.current = { blockId: result.focusBlockId, start: result.focusCaret, end: result.focusCaret };
      return result.blocks;
    });
    if (overflow > 0) setError(`每条星语最多插入 ${MAX_MOMENT_INLINE_IMAGES} 张图片，已忽略超出的 ${overflow} 张`);
    else setError('');
    if (focusTarget) setPendingFocus(focusTarget);
    if (pending.length) runRemoteImports(pending);
  }, [runRemoteImports, trackPreviewUrl]);

  const addImages = (files: FileList | File[] | null) => {
    if (!files || saving) return;
    const list = Array.from(files);
    const accepted = list.filter((file) => file.type.startsWith('image/'));
    if (accepted.length !== list.length) setError('仅支持 JPG/PNG/WebP/GIF 图片');
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!accepted.length) return;
    const { blockId, start, end } = activeCursorRef.current;
    insertSegments(blockId, start, end, accepted.map((file) => ({ type: 'image-file', file, alt: '' })));
  };

  const totalVideoCount = existingVideos.length + videos.length;
  const maxNewVideos = Math.max(0, 9 - existingVideos.length - (editingMoment?.attachments?.length || 0));

  const addVideos = (files: FileList | File[] | null) => {
    if (!files || saving) return;
    const list = Array.from(files);
    const accepted = list.filter((file) => file.type.startsWith('video/'));
    if (accepted.length !== list.length) setError('仅支持 MP4/WebM/MOV 视频');
    setVideos((current) => [...current, ...accepted].slice(0, maxNewVideos));
    if (videos.length + accepted.length > maxNewVideos) setError('每条星语最多添加 9 个视频/附件');
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const addDroppedFiles = (files: File[]) => {
    if (!files.length || saving) return;
    const droppedImages = files.filter((file) => file.type.startsWith('image/'));
    const droppedVideos = files.filter((file) => file.type.startsWith('video/'));
    if (droppedImages.length + droppedVideos.length !== files.length) {
      setError('仅支持图片和视频文件');
    }
    if (droppedImages.length) addImages(droppedImages);
    if (droppedVideos.length) addVideos(droppedVideos);
  };

  const handleRemoveImage = useCallback((imageBlockId: string) => {
    importControllersRef.current.get(imageBlockId)?.abort();
    importControllersRef.current.delete(imageBlockId);
    let focusTarget: { blockId: string; caret: number } | null = null;
    let removedUrl: string | undefined;
    setBlocks((current) => {
      const result = removeImageBlock(current, imageBlockId);
      removedUrl = result.removed?.previewUrl;
      focusTarget = { blockId: result.focusBlockId, caret: result.focusCaret };
      activeCursorRef.current = { blockId: result.focusBlockId, start: result.focusCaret, end: result.focusCaret };
      return result.blocks;
    });
    revokePreviewUrl(removedUrl);
    if (focusTarget) setPendingFocus(focusTarget);
  }, [revokePreviewUrl]);

  const handleRetryImage = useCallback((imageBlockId: string) => {
    const target = blocks.find((block) => block.id === imageBlockId && block.type === 'image');
    if (!target || target.type !== 'image' || !target.sourceUrl) return;
    const sessionId = sessionIdRef.current;
    setBlocks((current) =>
      current.map((block) =>
        block.id === imageBlockId && block.type === 'image'
          ? { ...block, status: 'loading', errorMessage: undefined }
          : block
      )
    );
    void fetchOneRemoteImage(imageBlockId, target.sourceUrl, sessionId);
  }, [blocks, fetchOneRemoteImage]);

  const handleReplaceImage = useCallback((imageBlockId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('仅支持 JPG/PNG/WebP/GIF 图片');
      return;
    }
    importControllersRef.current.get(imageBlockId)?.abort();
    importControllersRef.current.delete(imageBlockId);
    const previewUrl = trackPreviewUrl(file);
    let previousUrl: string | undefined;
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== imageBlockId || block.type !== 'image') return block;
        previousUrl = block.previewUrl;
        return { ...block, status: 'ready', existingId: undefined, file, previewUrl, errorMessage: undefined };
      })
    );
    revokePreviewUrl(previousUrl);
    setError('');
  }, [revokePreviewUrl, trackPreviewUrl]);

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
    recordingRequestIdRef.current += 1;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
  }, []);

  useEffect(() => {
    if (open) return;
    recordingRequestIdRef.current += 1;
    requestingMicrophoneRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
    setRecording(false);
    setRequestingMicrophone(false);
  }, [open]);

  const close = () => {
    if (saving) return;
    recordingRequestIdRef.current += 1;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
    reset();
    onClose();
  };

  const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer?.types || []).includes('Files');
  const endDrag = () => { dragDepthRef.current = 0; setDragging(false); };

  const startRecording = async () => {
    if (saving || requestingMicrophoneRef.current) return;
    if (recording) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持语音录制');
      return;
    }
    setError('');
    setRequestingMicrophone(true);
    requestingMicrophoneRef.current = true;
    const requestId = ++recordingRequestIdRef.current;
    let requestedStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      requestedStream = stream;
      if (requestId !== recordingRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      let failed = false;
      streamRef.current = stream;
      recorderRef.current = recorder;
      const startedAt = Date.now();
      recordingStartedAtRef.current = startedAt;
      setRecordingMs(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        stream.getTracks().forEach((track) => track.stop());
        if (requestId === recordingRequestIdRef.current) {
          setRecording(false);
          setError('录音失败，请重试');
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (requestId !== recordingRequestIdRef.current) return;
        const duration = Math.max(0, Date.now() - startedAt);
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        if (!failed && chunks.length > 0) {
          const extension = type.startsWith('audio/mp4') ? 'm4a' : 'webm';
          const blob = new Blob(chunks, { type });
          setExistingVoice(null);
          setVoice(new File([blob], `voice-${Date.now()}.${extension}`, { type }));
          setVoiceDurationMs(duration);
        }
        setRecording(false);
        setRecordingMs(0);
      };
      recorder.start(250);
      setRecording(true);
    } catch (recordError) {
      requestedStream?.getTracks().forEach((track) => track.stop());
      if (requestId !== recordingRequestIdRef.current) return;
      recorderRef.current = null;
      streamRef.current = null;
      setRecording(false);
      setError(recordError instanceof DOMException && recordError.name === 'NotAllowedError' ? '需要允许麦克风权限才能录制语音' : '暂时无法使用麦克风');
    } finally {
      if (requestId === recordingRequestIdRef.current) {
        requestingMicrophoneRef.current = false;
        setRequestingMicrophone(false);
      }
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

  const loadingImageCount = blocks.filter((block) => block.type === 'image' && block.status === 'loading').length;
  const failedImageCount = blocks.filter((block) => block.type === 'image' && block.status === 'error').length;
  const imageCount = countDraftInlineImages(blocks);
  const textLength = countDraftTextLength(blocks);
  const activeVoice = voice && voiceUrl ? { url: voiceUrl, durationMs: voiceDurationMs } : existingVoice;

  const submit = async () => {
    if (saving || recording || requestingMicrophone || loadingImageCount > 0) return;
    if (failedImageCount > 0) {
      setError('还有未能拉取的图片，请先替换或移除后再提交');
      return;
    }
    if (textLength > MAX_MOMENT_TEXT_LENGTH) {
      setError(`星语文字不能超过 ${MAX_MOMENT_TEXT_LENGTH} 个字符`);
      return;
    }
    const submission = buildMomentSubmission(blocks);
    const hasExistingAttachments = Boolean(editingMoment?.attachments?.length);
    if (!submission.text && imageCount === 0 && totalVideoCount === 0 && !activeVoice && !hasExistingAttachments) {
      setError('写点文字，或添加图片、视频、语音后再提交');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = editingMoment
        ? await updateMoment(editingMoment, {
            text: submission.text,
            blocks: submission.blocks || [],
            inlineImages: submission.inlineImages,
            media: videos,
            keepMediaIds: existingVideos.map((item) => item.id),
            voice,
            removeVoice: Boolean(editingMoment.voice && !existingVoice && !voice),
            voiceDurationMs,
            location
          })
        : await createMoment({
            text: submission.text,
            blocks: submission.blocks,
            inlineImages: submission.inlineImages,
            media: videos,
            voice,
            voiceDurationMs,
            location
          });
      reset();
      onPublished(saved);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (isEditing ? '保存失败，请重试' : '发布失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      centered
      destroyOnHidden
      width={880}
      title={null}
      closable={false}
      aria-labelledby="moment-composer-heading"
      mask={{ closable: !saving }}
      keyboard={!saving}
      styles={{ container: { padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}
      rootClassName={appearance === 'journal' ? 'moment-journal-composer' : undefined}
    >
      <div
        className="moment-composer"
        data-dragging={dragging || undefined}
        onDragEnter={event => { if (!hasFiles(event) || saving) return; event.preventDefault(); dragDepthRef.current += 1; setDragging(true); }}
        onDragOver={event => { if (!hasFiles(event) || saving) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={event => { if (!hasFiles(event)) return; dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false); }}
        onDrop={event => { if (!hasFiles(event)) return; event.preventDefault(); endDrag(); addDroppedFiles(Array.from(event.dataTransfer.files)); }}
        onPaste={event => {
          const parsed = parseMomentClipboard(event.clipboardData);
          if (!parsed.segments.length || (!parsed.hasHtml && !parsed.hasImages)) return;
          event.preventDefault();
          const { blockId, start, end } = activeCursorRef.current;
          insertSegments(blockId, start, end, parsed.segments);
        }}>
        {dragging && <div className="moment-drop-hint" aria-hidden="true"><PictureOutlined /><span>松开以插入图片或视频</span></div>}
        <header className="moment-composer-head">
          <Button variant="ghost" type="button" onClick={close} disabled={saving}>取消</Button>
          <h2 id="moment-composer-heading">{isEditing ? '编辑星语' : '发布星语'}</h2>
          <Button variant="primary" type="button" onClick={() => void submit()} disabled={saving || recording || requestingMicrophone || loadingImageCount > 0}>
            {(saving || loadingImageCount > 0) && <LoadingOutlined />}
            {saving ? (isEditing ? '保存中' : '发布中') : loadingImageCount > 0 ? '转存中' : (isEditing ? '保存' : '发布')}
          </Button>
        </header>

        <div className="moment-composer-body">
          <MomentBlockEditor
            blocks={blocks}
            disabled={saving}
            pendingFocus={pendingFocus}
            onPendingFocusHandled={() => setPendingFocus(null)}
            onActiveTextChange={(blockId, start, end) => {
              activeCursorRef.current = { blockId, start, end };
            }}
            onTextChange={(blockId, nextText) => {
              setBlocks((current) => current.map((block) => (block.id === blockId && block.type === 'text' ? { ...block, text: nextText } : block)));
            }}
            onInsertSegments={insertSegments}
            onRemoveImage={handleRemoveImage}
            onRetryImage={handleRetryImage}
            onReplaceImage={handleReplaceImage}
          />

          {totalVideoCount > 0 && (
            <div className="moment-file-grid">
              {existingVideos.map((item) => (
                <div key={item.id} className="moment-file-preview">
                  <VideoPreview src={item.url} />
                  <Button variant="ghost" iconOnly type="button" onClick={() => setExistingVideos((current) => current.filter((v) => v.id !== item.id))} aria-label={`移除${item.name || '视频'}`}><DeleteOutlined /></Button>
                  <span><VideoCameraOutlined /> 视频</span>
                </div>
              ))}
              {videos.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="moment-file-preview">
                  <VideoPreview file={file} />
                  <Button variant="ghost" iconOnly type="button" onClick={() => setVideos((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除${file.name}`}><DeleteOutlined /></Button>
                  <span><VideoCameraOutlined /> 视频</span>
                </div>
              ))}
              {videos.length < maxNewVideos && <Button variant="outline" type="button" className="moment-add-file" onClick={() => videoInputRef.current?.click()}><VideoCameraOutlined /><span>添加视频</span></Button>}
            </div>
          )}

          {activeVoice && !recording && !requestingMicrophone && (
            <div className="moment-voice-draft">
              <MomentVoicePlayer voice={activeVoice} />
              <Button variant="ghost" iconOnly type="button" className="moment-voice-remove" onClick={() => { setVoice(null); setExistingVoice(null); setVoiceDurationMs(0); }} disabled={saving} aria-label="删除语音"><DeleteOutlined /></Button>
            </div>
          )}

          {recording && (
            <div className="moment-recording" aria-live="polite">
              <span className="moment-recording-dot" />
              <span>正在录音</span>
              <span className="font-mono">{formatVoiceDuration(recordingMs)}</span>
              <Button variant="ghost" type="button" onClick={() => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); }}><StopOutlined />完成</Button>
            </div>
          )}

          {location && (
            <Button variant="ghost" type="button" className="moment-location-chip" onClick={() => setLocation(null)} title="点击移除位置">
              <EnvironmentOutlined />
              <span>{location.label}</span>
              <DeleteOutlined />
            </Button>
          )}

          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(event) => addImages(event.target.files)} />
          <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden onChange={(event) => addVideos(event.target.files)} />

          <div className="moment-composer-bar">
            <div className="moment-composer-tools">
              <Button variant="ghost" size="sm" type="button" aria-label="插入图片" onClick={() => imageInputRef.current?.click()} disabled={imageCount >= MAX_MOMENT_INLINE_IMAGES}><PictureOutlined /><span>图片</span></Button>
              <Button variant="ghost" size="sm" type="button" aria-label="添加视频" onClick={() => videoInputRef.current?.click()} disabled={videos.length >= maxNewVideos}><VideoCameraOutlined /><span>视频</span></Button>
              <Button variant="ghost" size="sm" type="button" aria-label={requestingMicrophone ? '等待麦克风' : recording ? '停止录音' : activeVoice ? '重新录音' : '录制语音'} onClick={() => void startRecording()} disabled={requestingMicrophone || saving} aria-pressed={recording}>{requestingMicrophone ? <LoadingOutlined /> : <AudioOutlined />}<span>{requestingMicrophone ? '等待麦克风' : recording ? '停止录音' : activeVoice ? '重新录音' : '语音'}</span></Button>
              <Button variant="ghost" size="sm" type="button" aria-label={location ? '移除位置' : locating ? '正在定位' : '添加位置'} onClick={locate} aria-pressed={!!location} disabled={locating}>{locating ? <LoadingOutlined /> : <EnvironmentOutlined />}<span>{locating ? '定位中' : '位置'}</span></Button>
            </div>
            <div className="moment-composer-meta">
              {loadingImageCount > 0 && <span className="moment-composer-meta-loading"><Icon name="loading" size="sm" />转存 {loadingImageCount}</span>}
              {failedImageCount > 0 && <span className="moment-composer-meta-error">{failedImageCount} 张失败</span>}
              {imageCount > 0 && <span>{imageCount}/{MAX_MOMENT_INLINE_IMAGES} 图</span>}
              <span className={`moment-composer-count${textLength > MAX_MOMENT_TEXT_LENGTH ? ' is-over' : ''}`}>{textLength} / {MAX_MOMENT_TEXT_LENGTH}</span>
            </div>
          </div>

          {error && <p className="moment-inline-error" role="alert">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
