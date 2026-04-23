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
  const editorRef = useRef<HTMLDivElement>(null);
  const hasContent = inputText.trim().length > 0;

  const syncText = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    useSoulStore.getState().setInputText(el.innerText);
  }, []);

  const clampHeight = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_LINES + PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, []);

  const handleSend = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const text = el.innerText;
    if (!text.trim()) return;

    soulChat.sendTextMessage(text);
    el.innerText = '';
    clampHeight();
  }, [clampHeight]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    syncText();
    clampHeight();
  }, [syncText, clampHeight]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (inputText === '' && el.innerText !== '') {
      el.innerText = '';
      clampHeight();
    }
  }, [inputText, clampHeight]);

  return (
    <div className="flex items-end gap-2">
      <div className="relative flex-1 min-w-0">
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-label="输入消息"
          className="w-full min-h-[38px] px-3 py-2 rounded-lg text-sm leading-[22px]
                     bg-input text-input-foreground
                     border border-border focus:border-border-focus focus:outline-none
                     empty:before:content-[attr(data-placeholder)] empty:before:text-input-placeholder
                     overflow-hidden break-words whitespace-pre-wrap transition-colors"
          data-placeholder="输入消息..."
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!hasContent}
        className={`send-btn shrink-0 w-9 h-[38px] flex items-center justify-center rounded-lg transition-colors ${
          hasContent ? 'bg-primary text-white hover:bg-primary-hover' : 'bg-surface-hover text-foreground-muted cursor-not-allowed'
        }`}
        aria-label="发送"
      >
        <SendOutlined className="send-icon text-base" />
      </button>
    </div>
  );
}
