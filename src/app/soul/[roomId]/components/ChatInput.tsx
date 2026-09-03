'use client';

import { useRef, useCallback, useEffect } from 'react';
import { SendOutlined } from '@ant-design/icons';
import { useSoulStore } from '../../store';
import { soulChat } from '../../core';

const MAX_LINES = 5;
const LINE_HEIGHT = 22;
const PADDING_Y = 16;

export function ChatInput() {
  const inputText = useSoulStore((s) => s.inputText);
  const connectionState = useSoulStore((s) => s.connectionState);
  const isSending = useSoulStore((s) => s.isSending);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const hasContent = inputText.trim().length > 0;

  const clampHeight = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_LINES + PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  const handleSend = useCallback(async () => {
    if (isComposingRef.current || !inputText.trim()) return;
    await soulChat.sendTextMessage(inputText);
  }, [inputText]);

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
    <div className="flex items-end gap-2">
      <div className="relative flex-1 min-w-0">
        <textarea
          ref={editorRef}
          aria-label="输入消息"
          value={inputText}
          rows={1}
          className="block w-full min-h-[38px] resize-none px-3 py-2 rounded-lg text-sm leading-[22px]
                     bg-input text-input-foreground
                     border border-border focus:border-border-focus focus:outline-none
                     placeholder:text-input-placeholder
                     overflow-hidden break-words whitespace-pre-wrap transition-colors"
          placeholder="输入消息..."
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
        disabled={!hasContent || isSending || connectionState !== 'connected'}
        className={`send-btn shrink-0 w-9 h-[38px] flex items-center justify-center rounded-lg transition-colors ${
          hasContent && !isSending && connectionState === 'connected' ? 'bg-primary text-white hover:bg-primary-hover' : 'bg-surface-hover text-foreground-muted cursor-not-allowed'
        }`}
        aria-label="发送"
      >
        <SendOutlined className="send-icon text-base" />
      </button>
    </div>
  );
}
