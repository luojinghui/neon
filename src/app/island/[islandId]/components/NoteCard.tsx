'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { IslandItem, NoteColorKey, NoteItemData } from '../../core/types';
import styles from '../island-canvas.module.css';

const NOTE_COLORS: { key: NoteColorKey; label: string; swatch: string }[] = [
  { key: 'sun', label: '暖阳黄', swatch: '#FFE891' },
  { key: 'sky', label: '晴空蓝', swatch: '#BBE2FF' },
  { key: 'blush', label: '樱花粉', swatch: '#FFC7D6' },
  { key: 'mint', label: '薄荷绿', swatch: '#B8EDD3' },
  { key: 'lavender', label: '薰衣草紫', swatch: '#D6C4FF' }
];

interface NoteCardProps {
  item: IslandItem;
  canEdit: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChangeData: (data: NoteItemData) => void;
}

export function NoteCard({
  item,
  canEdit,
  isSelected,
  isEditing,
  onStartEdit,
  onStopEdit,
  onChangeData
}: NoteCardProps) {
  const data = item.data as NoteItemData;
  const color: NoteColorKey = data?.color || 'sun';
  const [draft, setDraft] = useState(data?.text || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(data?.text || '');
    }
  }, [data?.text, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const commitDraft = () => {
    if (draft !== (data?.text || '')) {
      onChangeData({ text: draft, color });
    }
    onStopEdit();
  };

  return (
    <div
      className={styles.noteCard}
      data-color={color}
      onDoubleClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {isEditing && canEdit ? (
        <Textarea
          ref={textareaRef}
          className={styles.noteTextarea}
          value={draft}
          maxLength={600}
          placeholder="写下此刻的想法..."
          aria-label="编辑便利贴文字"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
              event.preventDefault();
              commitDraft();
            }
          }}
        />
      ) : (
        <div className={styles.noteTextDisplay}>
          {data?.text ? (
            data.text
          ) : (
            <span className={styles.notePlaceholder}>{canEdit ? '双击写下便利贴...' : '空白便利贴'}</span>
          )}
        </div>
      )}

      <div className={styles.noteFooter}>
        <span className={styles.noteAuthor}>— {item.authorName || '旅人'}</span>
        {canEdit && (isSelected || isEditing) ? (
          <div
            className={styles.noteSwatches}
            role="group"
            aria-label="选择便利贴颜色"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {NOTE_COLORS.map((swatch) => (
              <Button
                key={swatch.key}
                variant="ghost"
                data-ui-surface=""
                type="button"
                className={styles.noteSwatchBtn}
                style={{ backgroundColor: swatch.swatch }}
                data-active={color === swatch.key ? 'true' : undefined}
                aria-label={swatch.label}
                aria-pressed={color === swatch.key}
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeData({ text: isEditing ? draft : data?.text || '', color: swatch.key });
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
