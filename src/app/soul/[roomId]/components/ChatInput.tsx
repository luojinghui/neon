'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { SendOutlined } from '@ant-design/icons';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';
import { clipboardImages } from '@/lib/clipboardImages';
import { ImageAttachmentDraft } from '@/components/image-viewer/ImageAttachmentDraft';

const MAX_LINES = 5;
const LINE_HEIGHT = 22;
const PADDING_Y = 16;

export function ChatInput() {
  const inputText = useSoulStore((s) => s.inputText);
  const connectionState = useSoulStore((s) => s.connectionState);
  const isSending = useSoulStore((s) => s.isSending);
  const isUploading = useSoulStore((s) => s.isUploading);
  const roomId = useSoulStore((s) => s.roomId);
  const [images, setImages] = useState<File[]>([]);
  const [sendingImages, setSendingImages] = useState(false);
  const sendingRef = useRef(false);
  const draftGeneration = useRef(0);
  useEffect(() => {
    setImages([]); setSendingImages(false); sendingRef.current = false;
    const generation = ++draftGeneration.current;
    return () => { draftGeneration.current = generation + 1; };
  }, [roomId]);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const hasContent = inputText.trim().length > 0 || images.length > 0;
  const busy = isSending || isUploading || sendingImages;

  const clampHeight = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_LINES + PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  const handleSend = useCallback(async () => {
    if (isComposingRef.current || sendingRef.current || busy || connectionState !== 'connected') return;
    sendingRef.current = true;
    const generation = draftGeneration.current;
    setSendingImages(true);
    try {
      for (const file of images) {
        if (!await soulChat.uploadAndSend(file)) return;
        if (generation !== draftGeneration.current) return;
        setImages(current => current.filter(item => item !== file));
      }
      if (generation === draftGeneration.current && inputText.trim()) await soulChat.sendTextMessage(inputText);
    } finally { if (generation === draftGeneration.current) { sendingRef.current = false; setSendingImages(false); } }
  }, [inputText, images, busy, connectionState]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  useEffect(() => {
    clampHeight();
  }, [inputText, clampHeight]);

  return (
    <div>
      {images.length > 0 && <div className="flex gap-2 overflow-x-auto px-3 pb-2" aria-label="待发送图片">
        {images.map((file, index) => <ImageAttachmentDraft key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={busy} onRemove={() => setImages(current => current.filter(item => item !== file))} />)}
      </div>}
    <div className="flex items-end gap-2">
      <div className="relative flex-1 min-w-0">
        <textarea
          ref={editorRef}
          aria-label="输入消息"
          value={inputText}
          rows={1}
          className="block w-full min-h-10 resize-none px-3 py-2 rounded-lg text-sm leading-[22px]
                     bg-transparent text-input-foreground
                     border-0 focus:outline-none
                     placeholder:text-input-placeholder
                     overflow-hidden break-words whitespace-pre-wrap transition-colors"
          placeholder="输入消息…"
          onPaste={event => {
            const pasted = clipboardImages(event.clipboardData);
            if (!pasted.length) return;
            event.preventDefault();
            if (busy) return;
            if (pasted.length + images.length > 9) useSoulStore.getState().setChatError('每次最多发送 9 张图片');
            setImages(current => [...current, ...pasted].slice(0, 9));
          }}
          onChange={(event) => useSoulStore.getState().setInputText(event.currentTarget.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!hasContent || busy || connectionState !== 'connected'}
        className={`send-btn shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          hasContent && !busy && connectionState === 'connected' ? 'bg-primary text-white hover:bg-primary-hover' : 'bg-surface-hover text-foreground-muted cursor-not-allowed'
        }`}
        aria-label="发送"
      >
        <SendOutlined className="send-icon text-base" />
      </button>
    </div>
    </div>
  );
}
