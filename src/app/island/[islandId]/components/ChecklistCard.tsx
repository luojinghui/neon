'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import type { ChecklistEntry, ChecklistItemData, IslandItem, NoteColorKey } from '../../core/types';
import styles from '../island-canvas.module.css';

const CARD_COLORS: { key: NoteColorKey; label: string; swatch: string }[] = [
  { key: 'sun', label: '暖阳黄', swatch: '#FFE891' },
  { key: 'sky', label: '晴空蓝', swatch: '#BBE2FF' },
  { key: 'blush', label: '樱花粉', swatch: '#FFC7D6' },
  { key: 'mint', label: '薄荷绿', swatch: '#B8EDD3' },
  { key: 'lavender', label: '薰衣草紫', swatch: '#D6C4FF' }
];

const MAX_ENTRIES = 30;

function createEntryId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface ChecklistCardProps {
  item: IslandItem;
  canEdit: boolean;
  canToggle: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChangeData: (data: ChecklistItemData) => void;
  onToggleEntry: (entryId: string, done: boolean) => void;
}

export function ChecklistCard({
  item,
  canEdit,
  canToggle,
  isSelected,
  isEditing,
  onStartEdit,
  onStopEdit,
  onChangeData,
  onToggleEntry
}: ChecklistCardProps) {
  const data = item.data as ChecklistItemData;
  const color: NoteColorKey = data?.color || 'mint';
  const entries: ChecklistEntry[] = Array.isArray(data?.entries) ? data.entries : [];

  const [titleDraft, setTitleDraft] = useState(data?.title || '');
  const [newEntryText, setNewEntryText] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setTitleDraft(data?.title || '');
    }
  }, [data?.title, isEditing]);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  const completedCount = entries.filter((entry) => entry.done).length;
  const progressPercent = entries.length > 0 ? Math.round((completedCount / entries.length) * 100) : 0;

  const commitTitle = () => {
    const nextTitle = titleDraft.trim();
    if (nextTitle !== (data?.title || '')) {
      onChangeData({ title: nextTitle, entries, color });
    }
    onStopEdit();
  };

  const handleAddEntry = () => {
    if (!canEdit) return;
    const text = newEntryText.trim();
    if (!text || entries.length >= MAX_ENTRIES) return;
    const nextEntries: ChecklistEntry[] = [...entries, { id: createEntryId(), text: text.slice(0, 120), done: false }];
    setNewEntryText('');
    onChangeData({ title: isEditing ? titleDraft.trim() : data?.title || '', entries: nextEntries, color });
  };

  const handleRemoveEntry = (entryId: string) => {
    if (!canEdit) return;
    const nextEntries = entries.filter((entry) => entry.id !== entryId);
    onChangeData({ title: isEditing ? titleDraft.trim() : data?.title || '', entries: nextEntries, color });
  };

  const handleRenameEntry = (entryId: string, text: string) => {
    if (!canEdit) return;
    const nextEntries = entries.map((entry) =>
      entry.id === entryId ? { ...entry, text: text.slice(0, 120) } : entry
    );
    onChangeData({ title: isEditing ? titleDraft.trim() : data?.title || '', entries: nextEntries, color });
  };

  return (
    <div
      className={styles.checklistCard}
      data-color={color}
      onDoubleClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        onStartEdit();
      }}
    >
      <div className={styles.checklistHeader}>
        {isEditing && canEdit ? (
          <div className={styles.checklistTitleEdit} onPointerDown={(event) => event.stopPropagation()}>
            <Input
              ref={titleInputRef}
              size="sm"
              className="min-w-0 flex-1"
              value={titleDraft}
              maxLength={60}
              placeholder="清单标题..."
              aria-label="清单标题"
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  commitTitle();
                }
              }}
            />
          </div>
        ) : (
          <div className={styles.checklistTitleRow}>
            <span className={styles.checklistTitle} title={data?.title || '清单'}>
              {data?.title || <span className={styles.notePlaceholder}>{canEdit ? '双击命名清单...' : '共享清单'}</span>}
            </span>
            <span className={styles.checklistCount}>
              {completedCount}/{entries.length}
            </span>
          </div>
        )}
        <div className={styles.checklistProgressTrack} aria-hidden="true">
          <div className={styles.checklistProgressFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div
        className={styles.checklistBody}
        data-canvas-scrollable="true"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {entries.length === 0 ? (
          <p className={styles.checklistEmpty}>
            {canEdit ? '在下方添加第一条待办吧' : '暂无待办事项'}
          </p>
        ) : (
          <ul className={styles.checklistList}>
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={[styles.checklistRow, entry.done ? styles.checklistRowDone : ''].filter(Boolean).join(' ')}
              >
                <Checkbox
                  size="sm"
                  className={styles.checklistCheckbox}
                  checked={entry.done}
                  disabled={!canToggle}
                  aria-label={entry.text || '待办事项'}
                  onChange={(event) => {
                    if (!canToggle) return;
                    onToggleEntry(entry.id, event.target.checked);
                  }}
                />
                {isEditing && canEdit ? (
                  <Input
                    size="sm"
                    className="min-w-0 flex-1"
                    defaultValue={entry.text}
                    maxLength={120}
                    aria-label="编辑待办内容"
                    onBlur={(event) => {
                      const trimmed = event.target.value.trim();
                      if (trimmed && trimmed !== entry.text) {
                        handleRenameEntry(entry.id, trimmed);
                      }
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <span
                    className={styles.checklistEntryText}
                    onClick={() => {
                      if (canToggle) onToggleEntry(entry.id, !entry.done);
                    }}
                  >
                    {entry.text}
                  </span>
                )}
                {canEdit && (isSelected || isEditing) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.checklistRemoveBtn}
                    aria-label="删除此条待办"
                    icon={<Icon name="close" size={12} />}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveEntry(entry.id);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && entries.length < MAX_ENTRIES ? (
        <div
          className={styles.checklistAddRow}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Input
            size="sm"
            className="min-w-0 flex-1"
            value={newEntryText}
            maxLength={120}
            placeholder="+ 添加待办，回车确认"
            aria-label="添加清单待办"
            onChange={(event) => setNewEntryText(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddEntry();
              }
            }}
          />
          {newEntryText.trim() ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="确认添加待办"
              icon={<Icon name="plus" size={12} />}
              onClick={handleAddEntry}
            />
          ) : null}
        </div>
      ) : null}

      <div className={styles.noteFooter}>
        <span className={styles.noteAuthor}>— {item.authorName || '旅人'}</span>
        {canEdit && (isSelected || isEditing) ? (
          <div
            className={styles.noteSwatches}
            role="group"
            aria-label="选择清单颜色"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {CARD_COLORS.map((swatch) => (
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
                  onChangeData({
                    title: isEditing ? titleDraft.trim() : data?.title || '',
                    entries,
                    color: swatch.key
                  });
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
