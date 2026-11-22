'use client';

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import type { IslandItem, IslandItemData, IslandOnlineUser, StickerItemData, TapeItemData } from '../../core/types';
import { ChecklistCard } from './ChecklistCard';
import { CountdownCard } from './CountdownCard';
import { NoteCard } from './NoteCard';
import { PolaroidCard } from './PolaroidCard';
import { StickerItem } from './StickerItem';
import styles from '../island-canvas.module.css';

interface CanvasItemProps {
  item: IslandItem;
  scale: number;
  isSelected: boolean;
  selfColor: string;
  canArrange: boolean;
  canEdit: boolean;
  lockedBy: IslandOnlineUser | null;
  focusedBy: IslandOnlineUser[];
  spacePressed: boolean;
  onSelect: (itemId: string) => void;
  onLock: (itemId: string | null) => void;
  onMove: (
    itemId: string,
    patch: { x: number; y: number; w?: number; h?: number; rotation?: number; zIndex?: number; persist: boolean }
  ) => void;
  onUpdateData: (item: IslandItem, data: IslandItemData) => void;
  onToggleChecklistEntry: (item: IslandItem, entryId: string, done: boolean) => void;
  onBringToFront: (itemId: string) => void;
  onSendToBack: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

function getMinBounds(type: IslandItem['type']): { minW: number; minH: number; maxW: number; maxH: number } {
  switch (type) {
    case 'note':
      return { minW: 160, minH: 140, maxW: 520, maxH: 520 };
    case 'countdown':
      return { minW: 180, minH: 150, maxW: 420, maxH: 320 };
    case 'checklist':
      return { minW: 200, minH: 180, maxW: 480, maxH: 640 };
    case 'polaroid':
      return { minW: 180, minH: 220, maxW: 560, maxH: 680 };
    case 'tape':
      return { minW: 110, minH: 28, maxW: 480, maxH: 96 };
    case 'sticker':
    default:
      return { minW: 64, minH: 64, maxW: 360, maxH: 360 };
  }
}

export function CanvasItem({
  item,
  scale,
  isSelected,
  selfColor,
  canArrange,
  canEdit,
  lockedBy,
  focusedBy,
  spacePressed,
  onSelect,
  onLock,
  onMove,
  onUpdateData,
  onToggleChecklistEntry,
  onBringToFront,
  onSendToBack,
  onDelete
}: CanvasItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isLockedByOther = Boolean(lockedBy);
  const canTransform = canArrange && !isLockedByOther;
  const canEditContent = canEdit && !isLockedByOther;

  const handleDragPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (spacePressed || event.button !== 0) return;
    event.stopPropagation();
    onSelect(item.id);
    if (!canTransform || isEditingNote) return;

    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Fall back to window pointer listeners if pointer capture is unavailable.
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = item.x;
    const startY = item.y;
    let moved = false;
    let latestX = startX;
    let latestY = startY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const dx = (moveEvent.clientX - startClientX) / scale;
      const dy = (moveEvent.clientY - startClientY) / scale;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      if (!moved) {
        moved = true;
        setIsDragging(true);
        onLock(item.id);
      }
      latestX = startX + dx;
      latestY = startY + dy;
      onMove(item.id, { x: latestX, y: latestY, persist: false });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      if (moved) {
        setIsDragging(false);
        onMove(item.id, { x: latestX, y: latestY, persist: true });
        onLock(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canTransform || event.button !== 0) return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    onLock(item.id);
    setIsDragging(true);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startW = item.w;
    const startH = item.h;
    const rad = (item.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const bounds = getMinBounds(item.type);

    let latestW = startW;
    let latestH = startH;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const worldDx = (moveEvent.clientX - startClientX) / scale;
      const worldDy = (moveEvent.clientY - startClientY) / scale;
      // Project delta into the item's rotated local axes
      const localDx = worldDx * cos + worldDy * sin;
      const localDy = -worldDx * sin + worldDy * cos;

      latestW = Math.min(bounds.maxW, Math.max(bounds.minW, startW + localDx));
      latestH = Math.min(bounds.maxH, Math.max(bounds.minH, startH + localDy));

      onMove(item.id, { x: item.x, y: item.y, w: latestW, h: latestH, persist: false });
    };

    const handlePointerUp = () => {
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerUp);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      setIsDragging(false);
      onMove(item.id, { x: item.x, y: item.y, w: latestW, h: latestH, persist: true });
      onLock(null);
    };

    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerUp);
  };

  const handleRotatePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canTransform || event.button !== 0 || !rootRef.current) return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    onLock(item.id);
    setIsDragging(true);

    const rect = rootRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const startRotation = item.rotation || 0;
    let latestRotation = startRotation;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let deg = startRotation + ((currentAngle - startAngle) * 180) / Math.PI;
      // Normalize to [-180, 180] and gently snap near 0 deg
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      if (Math.abs(deg) < 3) deg = 0;
      latestRotation = Math.round(deg * 10) / 10;

      onMove(item.id, { x: item.x, y: item.y, rotation: latestRotation, persist: false });
    };

    const handlePointerUp = () => {
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerUp);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      setIsDragging(false);
      onMove(item.id, { x: item.x, y: item.y, rotation: latestRotation, persist: true });
      onLock(null);
    };

    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerUp);
  };

  const renderContent = () => {
    switch (item.type) {
      case 'note':
        return (
          <NoteCard
            item={item}
            canEdit={canEditContent}
            isSelected={isSelected}
            isEditing={isEditingNote}
            onStartEdit={() => {
              if (!canEditContent) return;
              setIsEditingNote(true);
              onLock(item.id);
            }}
            onStopEdit={() => {
              setIsEditingNote(false);
              onLock(null);
            }}
            onChangeData={(data) => onUpdateData(item, data)}
          />
        );
      case 'countdown':
        return (
          <CountdownCard
            item={item}
            canEdit={canEditContent}
            isSelected={isSelected}
            isEditing={isEditingNote}
            onStartEdit={() => {
              if (!canEditContent) return;
              setIsEditingNote(true);
              onLock(item.id);
            }}
            onStopEdit={() => {
              setIsEditingNote(false);
              onLock(null);
            }}
            onChangeData={(data) => onUpdateData(item, data)}
          />
        );
      case 'checklist':
        return (
          <ChecklistCard
            item={item}
            canEdit={canEditContent}
            canToggle={canTransform}
            isSelected={isSelected}
            isEditing={isEditingNote}
            onStartEdit={() => {
              if (!canEditContent) return;
              setIsEditingNote(true);
              onLock(item.id);
            }}
            onStopEdit={() => {
              setIsEditingNote(false);
              onLock(null);
            }}
            onChangeData={(data) => onUpdateData(item, data)}
            onToggleEntry={(entryId, done) => onToggleChecklistEntry(item, entryId, done)}
          />
        );
      case 'polaroid':
        return (
          <PolaroidCard
            item={item}
            canEdit={canEditContent}
            onChangeData={(data) => onUpdateData(item, data)}
          />
        );
      case 'sticker':
        return (
          <StickerItem
            type="sticker"
            presetId={(item.data as StickerItemData)?.presetId || 'star'}
            itemId={item.id}
          />
        );
      case 'tape':
        return (
          <StickerItem
            type="tape"
            presetId={(item.data as TapeItemData)?.presetId || 'stripe-peach'}
            itemId={item.id}
          />
        );
      default:
        return null;
    }
  };

  const dragScale = isDragging ? ' scale(1.015)' : '';
  const primaryRemoteFocus = focusedBy[0] || null;
  const activeFocusColor = isSelected
    ? selfColor
    : primaryRemoteFocus?.color || 'hsl(var(--primary))';
  const itemStyle = {
    width: item.w,
    height: item.h,
    zIndex: item.zIndex,
    transform: `translate3d(${item.x}px, ${item.y}px, 0) rotate(${item.rotation || 0}deg)${dragScale}`,
    '--focus-color': activeFocusColor
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={[
        styles.canvasItem,
        !canTransform ? styles.canvasItemReadonly : '',
        isDragging ? styles.canvasItemDragging : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={itemStyle}
      onPointerDown={handleDragPointerDown}
    >
      <div className={styles.itemBody}>{renderContent()}</div>

      {/* Remote user lock indicator */}
      {isLockedByOther && lockedBy ? (
        <>
          <div
            className={styles.lockRing}
            style={{ '--lock-color': lockedBy.color } as CSSProperties}
          />
          <div
            className={styles.lockBadge}
            style={{ '--lock-color': lockedBy.color } as CSSProperties}
          >
            {lockedBy.name} 正在移动
          </div>
        </>
      ) : null}

      {/* Remote user(s) focus indicator */}
      {!isLockedByOther && focusedBy.length > 0 ? (
        <>
          {!isSelected ? (
            <div
              className={styles.focusRing}
              style={{ '--focus-color': primaryRemoteFocus?.color } as CSSProperties}
            />
          ) : null}
          <div
            className={[
              styles.focusBadgeStack,
              isSelected && (canTransform || canEditContent) ? styles.focusBadgeStackBottom : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {focusedBy.map((peer) => (
              <span
                key={peer.socketId}
                className={styles.focusBadge}
                style={{ '--focus-color': peer.color || 'hsl(var(--primary))' } as CSSProperties}
              >
                {peer.name || '旅人'}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* Selected outline + handles + floating action bar */}
      {isSelected && !isLockedByOther ? (
        <>
          <div className={styles.selectionRing} />

          {canTransform || canEditContent ? (
            <div
              className={styles.itemActionBar}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {(item.type === 'note' || item.type === 'countdown' || item.type === 'checklist') && canEditContent ? (
                <Tooltip title="编辑内容">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="编辑卡片内容"
                    icon={<Icon name="edit" size="sm" />}
                    onClick={() => {
                      setIsEditingNote(true);
                      onLock(item.id);
                    }}
                  />
                </Tooltip>
              ) : null}
              {canTransform ? (
                <>
                  <Tooltip title="置顶">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="置于顶层"
                      icon={
                        <Icon
                          name="arrow-down"
                          size="sm"
                          style={{ transform: 'rotate(180deg)' }}
                        />
                      }
                      onClick={() => onBringToFront(item.id)}
                    />
                  </Tooltip>
                  <Tooltip title="置底">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="置于底层"
                      icon={<Icon name="arrow-down" size="sm" />}
                      onClick={() => onSendToBack(item.id)}
                    />
                  </Tooltip>
                </>
              ) : null}
              {canEditContent ? (
                <Tooltip title="删除">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="删除物件"
                    icon={<Icon name="trash" size="sm" tone="danger" />}
                    onClick={() => onDelete(item.id)}
                  />
                </Tooltip>
              ) : null}
            </div>
          ) : null}

          {canTransform ? (
            <>
              <div className={styles.rotateHandleWrap}>
                <Button
                  variant="ghost"
                  data-ui-surface=""
                  type="button"
                  className={styles.rotateHandle}
                  aria-label="旋转物件"
                  title="拖动旋转"
                  onPointerDown={handleRotatePointerDown}
                >
                  <Icon name="redo" size={11} />
                </Button>
                <span className={styles.rotateStem} aria-hidden="true" />
              </div>

              <Button
                variant="ghost"
                data-ui-surface=""
                type="button"
                className={styles.resizeHandle}
                aria-label="缩放物件大小"
                title="拖动缩放"
                onPointerDown={handleResizePointerDown}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
