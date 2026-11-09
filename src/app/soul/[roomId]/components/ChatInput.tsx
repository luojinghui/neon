'use client';

import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';
import { useRef, useCallback, useEffect, useState } from 'react';
import { PaperClipOutlined, SendOutlined } from '@ant-design/icons';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';
import { clipboardImages } from '@/lib/clipboardImages';
import { SOUL_INSERT_TEXT_EVENT } from './insertText';
import { ImageAttachmentDraft } from '@/components/image-viewer/ImageAttachmentDraft';

const isImageFile = (file: File) => /^image\/(png|jpe?g|gif|webp)$/i.test(file.type);

function FileDraft({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) {
  return <div className="relative flex h-20 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-border bg-surface-inset px-2 text-xs">
    <PaperClipOutlined className="text-lg" />
    <span className="w-full truncate text-center" title={file.name}>{file.name}</span>
    <Button size="sm" iconOnly type="button" disabled={disabled} aria-label={`移除文件 ${file.name}`} onClick={onRemove} className="absolute right-0 top-0">×</Button>
  </div>;
}

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
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const isComposingRef = useRef(false);
  const hasContent = inputText.trim().length > 0 || images.length > 0;
  const busy = isSending || isUploading || sendingImages;

  // Emoji picked in the toolbar is inserted at the caret so the user can keep typing.
  useEffect(() => {
    const insert = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      const editor = editorRef.current;
      const value = useSoulStore.getState().inputText;
      const start = editor?.selectionStart ?? value.length;
      const end = editor?.selectionEnd ?? value.length;
      useSoulStore.getState().setInputText(value.slice(0, start) + text + value.slice(end));
      const caret = start + text.length;
      requestAnimationFrame(() => { editor?.focus(); editor?.setSelectionRange(caret, caret); });
    };
    window.addEventListener(SOUL_INSERT_TEXT_EVENT, insert);
    return () => window.removeEventListener(SOUL_INSERT_TEXT_EVENT, insert);
  }, []);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length || busy) return;
    if (files.length + images.length > 9) useSoulStore.getState().setChatError('每次最多发送 9 个附件');
    setImages(current => [...current, ...files].slice(0, 9));
  }, [busy, images.length]);

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

  return (
    <div
      className={dragging ? 'rounded-lg ring-2 ring-primary/50' : undefined}
      onDragEnter={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDragLeave={event => { if (!event.dataTransfer.types.includes('Files')) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={event => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault(); dragDepth.current = 0; setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {images.length > 0 && <div className="flex gap-2 overflow-x-auto px-3 pb-2" aria-label="待发送附件">
        {images.map((file, index) => !isImageFile(file) ? <FileDraft key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={busy} onRemove={() => setImages(current => current.filter(item => item !== file))} /> : <ImageAttachmentDraft key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={busy} onRemove={() => setImages(current => current.filter(item => item !== file))} />)}
      </div>}
    <div className="flex items-end gap-2">
      <div className="relative flex-1 min-w-0">
        <Textarea
          ref={editorRef}
          aria-label="输入消息"
          value={inputText}
          rows={1}
          autoSize={{ minRows: 1, maxRows: 5 }}
          className="w-full"
          placeholder="输入消息…"
          onPaste={event => {
            const pasted = clipboardImages(event.clipboardData);
            if (!pasted.length) return;
            event.preventDefault();
            addFiles(pasted);
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

      <Button variant="primary" size="lg" iconOnly
        type="button"
        onClick={handleSend}
        disabled={!hasContent || busy || connectionState !== 'connected'}
        className="shrink-0 w-10 h-10 flex items-center justify-center"
        aria-label="发送"
      >
        <SendOutlined className="text-base" />
      </Button>
    </div>
    </div>
  );
}
