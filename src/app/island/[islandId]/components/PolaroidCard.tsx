'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { IslandItem, PolaroidItemData } from '../../core/types';
import styles from '../island-canvas.module.css';

interface PolaroidCardProps {
  item: IslandItem;
  canEdit: boolean;
  onChangeData: (data: PolaroidItemData) => void;
}

export function PolaroidCard({ item, canEdit, onChangeData }: PolaroidCardProps) {
  const data = item.data as PolaroidItemData;
  const [editingCaption, setEditingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState(data?.caption || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingCaption) {
      setDraftCaption(data?.caption || '');
    }
  }, [data?.caption, editingCaption]);

  useEffect(() => {
    if (editingCaption && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCaption]);

  const commitCaption = () => {
    const trimmed = draftCaption.trim();
    if (trimmed !== (data?.caption || '')) {
      onChangeData({
        imageUrl: data?.imageUrl || '',
        caption: trimmed,
        dateLabel: data?.dateLabel || ''
      });
    }
    setEditingCaption(false);
  };

  return (
    <div className={styles.polaroidCard}>
      <div className={styles.polaroidPhotoBox}>
        {data?.imageUrl ? (
          <img
            src={data.imageUrl}
            alt={data.caption || '拍立得照片'}
            className={styles.polaroidPhoto}
            draggable={false}
          />
        ) : null}
      </div>

      <div className={styles.polaroidChin}>
        {editingCaption && canEdit ? (
          <Input
            ref={inputRef}
            size="sm"
            className={styles.polaroidCaptionInput}
            value={draftCaption}
            maxLength={60}
            placeholder="写一句简短配文..."
            aria-label="编辑拍立得配文"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraftCaption(event.target.value)}
            onBlur={commitCaption}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                commitCaption();
              }
            }}
          />
        ) : (
          <div
            className={styles.polaroidCaptionText}
            onPointerDown={(event) => {
              if (canEdit) event.stopPropagation();
            }}
            onClick={(event) => {
              if (!canEdit) return;
              event.stopPropagation();
              setEditingCaption(true);
            }}
            title={canEdit ? '点击编辑配文' : undefined}
          >
            {data?.caption ? (
              data.caption
            ) : canEdit ? (
              <span className={styles.polaroidCaptionEmpty}>点击添加配文...</span>
            ) : null}
          </div>
        )}

        <div className={styles.polaroidMetaRow}>
          <span>{item.authorName || '旅人'}</span>
          <span>{data?.dateLabel || ''}</span>
        </div>
      </div>
    </div>
  );
}
