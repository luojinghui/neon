'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import type { CountdownItemData, IslandItem, NoteColorKey } from '../../core/types';
import styles from '../island-canvas.module.css';

const CARD_COLORS: { key: NoteColorKey; label: string; swatch: string }[] = [
  { key: 'sun', label: '暖阳黄', swatch: '#FFE891' },
  { key: 'sky', label: '晴空蓝', swatch: '#BBE2FF' },
  { key: 'blush', label: '樱花粉', swatch: '#FFC7D6' },
  { key: 'mint', label: '薄荷绿', swatch: '#B8EDD3' },
  { key: 'lavender', label: '薰衣草紫', swatch: '#D6C4FF' }
];

function formatLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeDayDelta(targetDate: string): { mode: 'future' | 'today' | 'past'; days: number; displayDate: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(targetDate || '').trim());
  if (!match) {
    const today = formatLocalTodayIso();
    return { mode: 'today', days: 0, displayDate: today.replace(/-/g, '.') };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(year, month - 1, day);
  const diffDays = Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));
  const displayDate = `${match[1]}.${match[2]}.${match[3]}`;
  if (diffDays > 0) return { mode: 'future', days: diffDays, displayDate };
  if (diffDays < 0) return { mode: 'past', days: Math.abs(diffDays), displayDate };
  return { mode: 'today', days: 0, displayDate };
}

interface CountdownCardProps {
  item: IslandItem;
  canEdit: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChangeData: (data: CountdownItemData) => void;
}

export function CountdownCard({
  item,
  canEdit,
  isSelected,
  isEditing,
  onStartEdit,
  onStopEdit,
  onChangeData
}: CountdownCardProps) {
  const data = item.data as CountdownItemData;
  const color: NoteColorKey = data?.color || 'sun';
  const [titleDraft, setTitleDraft] = useState(data?.title || '');
  const [dateDraft, setDateDraft] = useState(data?.targetDate || formatLocalTodayIso());
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setTitleDraft(data?.title || '');
      setDateDraft(data?.targetDate || formatLocalTodayIso());
    }
  }, [data?.targetDate, data?.title, isEditing]);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  const delta = useMemo(() => computeDayDelta(isEditing ? dateDraft : data?.targetDate), [data?.targetDate, dateDraft, isEditing]);

  const commit = () => {
    const nextTitle = titleDraft.trim();
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(dateDraft) ? dateDraft : formatLocalTodayIso();
    if (nextTitle !== (data?.title || '') || nextDate !== (data?.targetDate || '')) {
      onChangeData({ title: nextTitle, targetDate: nextDate, color });
    }
    onStopEdit();
  };

  return (
    <div
      className={styles.countdownCard}
      data-color={color}
      onDoubleClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        onStartEdit();
      }}
    >
      <div className={styles.countdownTopBand}>
        <span className={styles.countdownKind}>
          <Icon name="calendar" size={12} />
          <span>纪念日</span>
        </span>
        <span className={styles.countdownDateText}>{delta.displayDate}</span>
      </div>

      {isEditing && canEdit ? (
        <div
          className={styles.countdownEditBody}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Input
            ref={titleInputRef}
            size="sm"
            value={titleDraft}
            maxLength={60}
            placeholder="写个期待的日子..."
            aria-label="纪念日名称"
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onStopEdit();
              }
            }}
          />
          <div className={styles.countdownEditRow}>
            <Input
              type="date"
              size="sm"
              className="min-w-0 flex-1"
              value={dateDraft}
              aria-label="目标日期"
              onChange={(event) => setDateDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onStopEdit();
                }
              }}
            />
            <Button variant="primary" size="sm" onClick={commit}>
              完成
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.countdownDisplayBody}>
          <div className={styles.countdownTitle} title={data?.title || '重要的日子'}>
            {data?.title || <span className={styles.notePlaceholder}>{canEdit ? '双击设置纪念日...' : '未命名日期'}</span>}
          </div>
          <div className={styles.countdownNumberRow}>
            {delta.mode === 'today' ? (
              <span className={styles.countdownToday}>就是今天</span>
            ) : (
              <>
                <span className={styles.countdownPrefix}>
                  {delta.mode === 'future' ? '还有' : '已过'}
                </span>
                <span className={styles.countdownNumber}>{delta.days}</span>
                <span className={styles.countdownSuffix}>天</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className={styles.noteFooter}>
        <span className={styles.noteAuthor}>— {item.authorName || '旅人'}</span>
        {canEdit && (isSelected || isEditing) ? (
          <div
            className={styles.noteSwatches}
            role="group"
            aria-label="选择纪念日颜色"
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
                    targetDate: isEditing ? dateDraft : data?.targetDate || formatLocalTodayIso(),
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
