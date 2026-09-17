import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import type { TextAreaProps, TextAreaRef } from 'antd/es/input/TextArea';
import LinkifiedText from './LinkifiedText';
import { splitTextLinks } from './textLinks';
import styles from './LinkTextArea.module.css';

/** Keep the native editor; links are interactive only while it is not being edited. */
export default function LinkTextArea({ value, ...props }: TextAreaProps & { value: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  // Match textarea's DOM newline normalization without changing the stored/source value.
  const displayText = useMemo(() => value.replace(/\r\n?/g, '\n'), [value]);
  const hasLinks = useMemo(() => splitTextLinks(displayText).some((segment) => segment.href), [displayText]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const textarea = inputRef.current?.resizableTextArea?.textArea;
    const overlay = overlayRef.current;
    if (!wrapper || !textarea || !overlay) return;

    const syncScroll = () => {
      if (overlay.scrollTop !== textarea.scrollTop) overlay.scrollTop = textarea.scrollTop;
      if (overlay.scrollLeft !== textarea.scrollLeft) overlay.scrollLeft = textarea.scrollLeft;
    };
    const syncEditorScroll = () => {
      if (textarea.scrollTop !== overlay.scrollTop) textarea.scrollTop = overlay.scrollTop;
      if (textarea.scrollLeft !== overlay.scrollLeft) textarea.scrollLeft = overlay.scrollLeft;
    };
    const syncLayout = () => {
      const textStyle = getComputedStyle(textarea);
      const textBounds = textarea.getBoundingClientRect();
      const wrapperBounds = wrapper.getBoundingClientRect();
      // Match the text viewport, including clear-button padding and excluding scrollbars.
      Object.assign(overlay.style, {
        top: `${textBounds.top - wrapperBounds.top + textarea.clientTop}px`,
        left: `${textBounds.left - wrapperBounds.left + textarea.clientLeft}px`,
        width: `${textarea.clientWidth}px`,
        height: `${textarea.clientHeight}px`,
        font: textStyle.font,
        lineHeight: textStyle.lineHeight,
        letterSpacing: textStyle.letterSpacing,
        padding: textStyle.padding,
        whiteSpace: textStyle.whiteSpace,
        overflowWrap: textStyle.overflowWrap,
        wordBreak: textStyle.wordBreak,
        tabSize: textStyle.tabSize,
        textAlign: textStyle.textAlign,
        textIndent: textStyle.textIndent,
        direction: textStyle.direction
      });
      syncScroll();
    };
    syncLayout();
    const observer = new ResizeObserver(syncLayout);
    observer.observe(textarea);
    observer.observe(wrapper);
    textarea.addEventListener('scroll', syncScroll);
    // Native scrolling on a link (including touch) follows the same text viewport.
    overlay.addEventListener('scroll', syncEditorScroll);
    return () => {
      observer.disconnect();
      textarea.removeEventListener('scroll', syncScroll);
      overlay.removeEventListener('scroll', syncEditorScroll);
    };
  }, [value, hasLinks]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <Input.TextArea
        {...props}
        ref={inputRef}
        value={value}
        onFocus={(event) => {
          setIsEditing(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsEditing(false);
          props.onBlur?.(event);
        }}
      />
      {hasLinks && (
        <div ref={overlayRef} className={`${styles.overlay} ${isEditing ? styles.editing : ''}`}>
          <LinkifiedText text={displayText} />
          {/* Preserve the final empty line when syncing a scrolled textarea. */}
          {displayText.endsWith('\n') ? '\u200b' : null}
        </div>
      )}
    </div>
  );
}
