'use client';

import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';
import { useRef, useCallback, useEffect, useState } from 'react';
import { SendOutlined } from '@ant-design/icons';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';
import { clipboardImages } from '@/lib/clipboardImages';
import { ImageAttachmentDraft } from '@/components/image-viewer/ImageAttachmentDraft';

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
    <div>
      {images.length > 0 && <div className="flex gap-2 overflow-x-auto px-3 pb-2" aria-label="待发送图片">
        {images.map((file, index) => <ImageAttachmentDraft key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={busy} onRemove={() => setImages(current => current.filter(item => item !== file))} />)}
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
