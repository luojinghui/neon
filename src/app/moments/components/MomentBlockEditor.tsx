'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { DraftBlock, DraftImageBlock, DraftTextBlock } from '../blockDraft';
import { parseMomentClipboard, type ParsedPasteSegment } from '../pasteParser';

type Props = {
  blocks: DraftBlock[];
  disabled: boolean;
  pendingFocus: { blockId: string; caret: number } | null;
  onPendingFocusHandled: () => void;
  onActiveTextChange: (blockId: string, selectionStart: number, selectionEnd: number) => void;
  onTextChange: (blockId: string, text: string) => void;
  onInsertSegments: (blockId: string, selectionStart: number, selectionEnd: number, segments: ParsedPasteSegment[]) => void;
  onRemoveImage: (blockId: string) => void;
  onRetryImage: (blockId: string) => void;
  onReplaceImage: (blockId: string, file: File) => void;
};

type RenderUnit =
  | { kind: 'text'; block: DraftTextBlock; index: number }
  | { kind: 'images'; items: { block: DraftImageBlock; index: number }[] };

/** Group consecutive images (separated only by empty unfocused text) into a tidy grid. */
function buildRenderUnits(blocks: DraftBlock[], focusedTextId: string): RenderUnit[] {
  const units: RenderUnit[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type === 'text') {
      const prev = blocks[i - 1];
      const next = blocks[i + 1];
      const isEmptyBetweenImages =
        prev?.type === 'image' &&
        next?.type === 'image' &&
        block.text.length === 0 &&
        block.id !== focusedTextId;
      if (isEmptyBetweenImages) continue;
      units.push({ kind: 'text', block, index: i });
    } else {
      const last = units[units.length - 1];
      if (last && last.kind === 'images') last.items.push({ block, index: i });
      else units.push({ kind: 'images', items: [{ block, index: i }] });
    }
  }
  return units;
}

export function MomentBlockEditor({
  blocks,
  disabled,
  pendingFocus,
  onPendingFocusHandled,
  onActiveTextChange,
  onTextChange,
  onInsertSegments,
  onRemoveImage,
  onRetryImage,
  onReplaceImage
}: Props) {
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const imageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacingBlockIdRef = useRef<string>('');
  const [focusedTextId, setFocusedTextId] = useState<string>(blocks[0]?.id || '');
  const [selectedImageId, setSelectedImageId] = useState<string>('');

  const hasAnyImage = blocks.some((block) => block.type === 'image');
  const units = buildRenderUnits(blocks, focusedTextId);
  const lastTextBlock = [...blocks].reverse().find((block): block is DraftTextBlock => block.type === 'text');

  const focusTextBlock = (blockId: string, caret: number) => {
    setSelectedImageId('');
    setFocusedTextId(blockId);
    // Defer if the text block was just uncollapsed out of a grid cluster.
    const apply = () => {
      const node = textareaRefs.current.get(blockId);
      if (!node) return;
      node.focus();
      const safeCaret = Math.max(0, Math.min(caret, node.value.length));
      node.setSelectionRange(safeCaret, safeCaret);
      node.scrollIntoView({ block: 'nearest' });
    };
    if (textareaRefs.current.has(blockId)) apply();
    else window.requestAnimationFrame(apply);
  };

  const focusImageBlock = (blockId: string) => {
    setFocusedTextId('');
    setSelectedImageId(blockId);
    const node = imageRefs.current.get(blockId);
    if (node) {
      node.focus();
      node.scrollIntoView({ block: 'nearest' });
    }
  };

  useEffect(() => {
    if (!pendingFocus) return;
    setSelectedImageId('');
    setFocusedTextId(pendingFocus.blockId);
    const apply = () => {
      const node = textareaRefs.current.get(pendingFocus.blockId);
      if (!node) return;
      node.focus();
      const caret = Math.max(0, Math.min(pendingFocus.caret, node.value.length));
      node.setSelectionRange(caret, caret);
      node.scrollIntoView({ block: 'nearest' });
      onPendingFocusHandled();
    };
    if (textareaRefs.current.has(pendingFocus.blockId)) apply();
    else window.requestAnimationFrame(apply);
  }, [pendingFocus, blocks, onPendingFocusHandled]);

  const handlePaste = (blockId: string, event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const parsed = parseMomentClipboard(event.clipboardData);
    if (!parsed.hasHtml && !parsed.hasImages) return;
    if (parsed.segments.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    onInsertSegments(
      blockId,
      target.selectionStart ?? target.value.length,
      target.selectionEnd ?? target.value.length,
      parsed.segments
    );
  };

  const handleTextKeyDown = (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || event.nativeEvent.isComposing) return;
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const value = target.value;

    if (event.key === 'Backspace' && start === 0 && end === 0) {
      const prev = blocks[index - 1];
      if (prev?.type === 'image') {
        event.preventDefault();
        focusImageBlock(prev.id);
      }
      return;
    }

    if (event.key === 'Delete' && start === value.length && end === value.length) {
      const next = blocks[index + 1];
      if (next?.type === 'image') {
        event.preventDefault();
        focusImageBlock(next.id);
      }
      return;
    }

    if (start === end && (event.key === 'ArrowUp' || event.key === 'ArrowLeft')) {
      const atTop = event.key === 'ArrowLeft' ? start === 0 : !value.slice(0, start).includes('\n');
      if (atTop && index > 0) {
        const prev = blocks[index - 1];
        if (prev?.type === 'image') {
          event.preventDefault();
          focusImageBlock(prev.id);
        } else if (prev?.type === 'text') {
          event.preventDefault();
          focusTextBlock(prev.id, prev.text.length);
        }
      }
      return;
    }

    if (start === end && (event.key === 'ArrowDown' || event.key === 'ArrowRight')) {
      const atBottom = event.key === 'ArrowRight' ? end === value.length : !value.slice(end).includes('\n');
      if (atBottom && index < blocks.length - 1) {
        const next = blocks[index + 1];
        if (next?.type === 'image') {
          event.preventDefault();
          focusImageBlock(next.id);
        } else if (next?.type === 'text') {
          event.preventDefault();
          focusTextBlock(next.id, 0);
        }
      }
    }
  };

  const handleImageKeyDown = (block: DraftImageBlock, index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      setSelectedImageId('');
      onRemoveImage(block.id);
      return;
    }
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = blocks[index + 1];
      if (next?.type === 'text') {
        // If ArrowDown/Right over a collapsed empty text block between images, step to the next image unless Enter was pressed.
        const nextAfter = blocks[index + 2];
        if (event.key !== 'Enter' && next.text.length === 0 && nextAfter?.type === 'image') {
          focusImageBlock(nextAfter.id);
        } else {
          focusTextBlock(next.id, 0);
        }
      } else if (next?.type === 'image') {
        focusImageBlock(next.id);
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev = blocks[index - 1];
      if (prev?.type === 'text') {
        const prevBefore = blocks[index - 2];
        if (prev.text.length === 0 && prevBefore?.type === 'image') {
          focusImageBlock(prevBefore.id);
        } else {
          focusTextBlock(prev.id, prev.text.length);
        }
      } else if (prev?.type === 'image') {
        focusImageBlock(prev.id);
      }
    }
  };

  const handleReplaceImagePaste = (block: DraftImageBlock, event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const parsed = parseMomentClipboard(event.clipboardData);
    const fileSeg = parsed.segments.find((seg): seg is { type: 'image-file'; file: File; alt: string } => seg.type === 'image-file');
    if (!fileSeg) return;
    event.preventDefault();
    event.stopPropagation();
    onReplaceImage(block.id, fileSeg.file);
  };

  const handleCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || !lastTextBlock) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea, button, .moment-canvas-image')) return;
    focusTextBlock(lastTextBlock.id, lastTextBlock.text.length);
  };

  return (
    <div className="moment-editor-canvas chat-scrollbar" onClick={handleCanvasClick}>
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          const targetId = replacingBlockIdRef.current;
          event.currentTarget.value = '';
          if (file && targetId) onReplaceImage(targetId, file);
        }}
      />

      {units.map((unit) => {
        if (unit.kind === 'text') {
          const { block, index } = unit;
          const isOnlyBlock = !hasAnyImage && index === 0;
          const isLastBlock = block.id === lastTextBlock?.id;
          const placeholder = isOnlyBlock
            ? '此刻，想说点什么…'
            : index === 0
              ? '写点什么…'
              : isLastBlock
                ? '继续输入…'
                : '在此插入文字…';
          // Trailing space ensures Enter immediately grows the CSS Grid mirror by one full line.
          const mirrorText = `${block.text}${block.text.endsWith('\n') || !block.text ? ' ' : ''}`;
          return (
            <div key={block.id} className={`moment-canvas-field${isOnlyBlock ? ' is-tall' : ''}`}>
              <div className="moment-canvas-mirror" aria-hidden="true">{mirrorText}</div>
              <textarea
                ref={(node) => {
                  if (node) textareaRefs.current.set(block.id, node);
                  else textareaRefs.current.delete(block.id);
                }}
                className="moment-canvas-textarea"
                aria-label={isOnlyBlock ? '星语内容' : `正文段落 ${Math.floor(index / 2) + 1}`}
                value={block.text}
                disabled={disabled}
                rows={1}
                placeholder={placeholder}
                autoFocus={index === 0}
                onFocus={(event) => {
                  setSelectedImageId('');
                  setFocusedTextId(block.id);
                  onActiveTextChange(block.id, event.currentTarget.selectionStart ?? block.text.length, event.currentTarget.selectionEnd ?? block.text.length);
                }}
                onBlur={() => {
                  setFocusedTextId((current) => (current === block.id ? '' : current));
                }}
                onSelect={(event) => onActiveTextChange(block.id, event.currentTarget.selectionStart ?? block.text.length, event.currentTarget.selectionEnd ?? block.text.length)}
                onChange={(event) => {
                  onTextChange(block.id, event.target.value);
                  onActiveTextChange(block.id, event.currentTarget.selectionStart ?? event.target.value.length, event.currentTarget.selectionEnd ?? event.target.value.length);
                }}
                onPaste={(event) => handlePaste(block.id, event)}
                onKeyDown={(event) => handleTextKeyDown(index, event)}
              />
            </div>
          );
        }

        const isCluster = unit.items.length > 1;
        return (
          <div
            key={unit.items[0].block.id}
            className={`moment-canvas-media${isCluster ? ' is-grid' : ''}`}
            data-count={Math.min(unit.items.length, 3)}
          >
            {unit.items.map(({ block, index }) => {
              const selected = selectedImageId === block.id;
              const trailingText = blocks[index + 1];
              return (
                <div
                  key={block.id}
                  ref={(node) => {
                    if (node) imageRefs.current.set(block.id, node);
                    else imageRefs.current.delete(block.id);
                  }}
                  className={`moment-canvas-image is-${block.status}`}
                  data-selected={selected ? 'true' : undefined}
                  tabIndex={0}
                  onClick={() => setSelectedImageId(block.id)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setSelectedImageId((current) => (current === block.id ? '' : current));
                    }
                  }}
                  onKeyDown={(event) => handleImageKeyDown(block, index, event)}
                  onPaste={(event) => handleReplaceImagePaste(block, event)}
                >
                  {block.status === 'loading' && (
                    <div className="moment-canvas-image-status" role="status">
                      <Icon name="loading" />
                      <span>正在转存图片…</span>
                      <Button variant="ghost" size="sm" iconOnly type="button" disabled={disabled} aria-label="取消并移除图片" onClick={() => onRemoveImage(block.id)}>
                        <Icon name="close" size="sm" />
                      </Button>
                    </div>
                  )}

                  {block.status === 'ready' && block.previewUrl && (
                    <div className="moment-canvas-image-frame">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={block.previewUrl} alt={block.alt || block.file?.name || '正文图片'} />
                      <div className="moment-canvas-image-overlay">
                        {isCluster && trailingText?.type === 'text' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            type="button"
                            disabled={disabled}
                            aria-label="在此图下方插入文字"
                            title="在此图下方插入文字"
                            onClick={(event) => {
                              event.stopPropagation();
                              focusTextBlock(trailingText.id, 0);
                            }}
                          >
                            <Icon name="edit" size="sm" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          type="button"
                          disabled={disabled}
                          aria-label="替换图片"
                          title="替换图片"
                          onClick={(event) => {
                            event.stopPropagation();
                            replacingBlockIdRef.current = block.id;
                            replaceInputRef.current?.click();
                          }}
                        >
                          <Icon name="picture" size="sm" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          type="button"
                          disabled={disabled}
                          aria-label="移除图片"
                          title="移除图片"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedImageId('');
                            onRemoveImage(block.id);
                          }}
                        >
                          <Icon name="close" size="sm" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {block.status === 'error' && (
                    <div className="moment-canvas-image-error" role="alert">
                      <div className="moment-canvas-image-error-text">
                        <Icon name="exclamation-circle" tone="danger" size="sm" />
                        <span>{block.errorMessage || '图片无法自动拉取，可选图或选中后粘贴替换'}</span>
                      </div>
                      <div className="moment-canvas-image-error-ops">
                        {block.sourceUrl && (
                          <Button variant="ghost" size="sm" type="button" disabled={disabled} onClick={() => onRetryImage(block.id)}>重试</Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            replacingBlockIdRef.current = block.id;
                            replaceInputRef.current?.click();
                          }}
                        >
                          选图替换
                        </Button>
                        <Button variant="ghost" size="sm" iconOnly type="button" disabled={disabled} aria-label="移除图片" onClick={() => onRemoveImage(block.id)}>
                          <Icon name="close" size="sm" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
