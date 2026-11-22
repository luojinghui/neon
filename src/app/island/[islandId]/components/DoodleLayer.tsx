'use client';

import { useMemo, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import type { IslandStroke, IslandStrokeTool } from '../../core/types';
import type { IslandStrokeTransformPatch } from '../../core/socket';
import {
  computeBBox,
  computeCombinedBBox,
  pointsToSvgPath,
  scalePointsFromOrigin,
  translatePoints,
  type WorldRect
} from './strokeUtils';
import styles from '../island-canvas.module.css';

export interface LiveStroke {
  strokeId: string;
  tool: IslandStrokeTool;
  color: string;
  size: number;
  opacity: number;
  points: number[];
}

interface DoodleLayerProps {
  strokes: IslandStroke[];
  remoteLiveStrokes: LiveStroke[];
  activePathRef: RefObject<SVGPathElement | null>;
  visible: boolean;
  scale: number;
  selectMode: boolean;
  canEditBoard: boolean;
  selectedStrokeIds: string[];
  marqueeRect: WorldRect | null;
  viewBounds: { minX: number; minY: number; maxX: number; maxY: number };
  onTransformStrokes: (patches: IslandStrokeTransformPatch[], persist: boolean) => void;
  onDeleteStrokes: (strokeIds: string[]) => void;
}

export function DoodleLayer({
  strokes,
  remoteLiveStrokes,
  activePathRef,
  visible,
  scale,
  selectMode,
  canEditBoard,
  selectedStrokeIds,
  marqueeRect,
  viewBounds,
  onTransformStrokes,
  onDeleteStrokes
}: DoodleLayerProps) {
  const visibleStrokes = useMemo(() => {
    if (!visible) return [];
    const pad = 120;
    return strokes.filter((stroke) => {
      const b = stroke.bbox;
      if (!b) return true;
      return !(
        b.maxX < viewBounds.minX - pad ||
        b.minX > viewBounds.maxX + pad ||
        b.maxY < viewBounds.minY - pad ||
        b.minY > viewBounds.maxY + pad
      );
    });
  }, [strokes, viewBounds.maxX, viewBounds.maxY, viewBounds.minX, viewBounds.minY, visible]);

  const selectedStrokes = useMemo(() => {
    if (!selectMode || selectedStrokeIds.length === 0) return [];
    const idSet = new Set(selectedStrokeIds);
    return strokes.filter((s) => idSet.has(s.id));
  }, [selectMode, selectedStrokeIds, strokes]);

  const selectionBox = useMemo(() => computeCombinedBBox(selectedStrokes), [selectedStrokes]);

  const handleMovePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canEditBoard || selectedStrokes.length === 0) return;
    event.stopPropagation();

    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Fallback to window listeners
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const initialStrokes = selectedStrokes.map((s) => ({
      id: s.id,
      points: [...s.points],
      size: s.size
    }));
    let moved = false;
    let latestPatches: IslandStrokeTransformPatch[] = [];

    const buildPatches = (dx: number, dy: number): IslandStrokeTransformPatch[] =>
      initialStrokes.map((s) => {
        const nextPoints = translatePoints(s.points, dx, dy);
        return {
          strokeId: s.id,
          points: nextPoints,
          bbox: computeBBox(nextPoints)
        };
      });

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const dx = (moveEvent.clientX - startClientX) / scale;
      const dy = (moveEvent.clientY - startClientY) / scale;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;
      latestPatches = buildPatches(dx, dy);
      onTransformStrokes(latestPatches, false);
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      if (moved && latestPatches.length > 0) {
        onTransformStrokes(latestPatches, true);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleScalePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !canEditBoard || !selectionBox || selectedStrokes.length === 0) return;
    event.stopPropagation();

    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Fallback to window listeners
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const originX = selectionBox.minX;
    const originY = selectionBox.minY;
    const startW = Math.max(16, selectionBox.maxX - selectionBox.minX);
    const startH = Math.max(16, selectionBox.maxY - selectionBox.minY);
    const initialStrokes = selectedStrokes.map((s) => ({
      id: s.id,
      points: [...s.points],
      size: s.size
    }));

    let moved = false;
    let latestPatches: IslandStrokeTransformPatch[] = [];

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const dx = (moveEvent.clientX - startClientX) / scale;
      const dy = (moveEvent.clientY - startClientY) / scale;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;

      const nextW = Math.max(20, startW + dx);
      const nextH = Math.max(20, startH + dy);
      const scaleX = Math.max(0.2, Math.min(6, nextW / startW));
      const scaleY = Math.max(0.2, Math.min(6, nextH / startH));
      const avgScale = (scaleX + scaleY) / 2;

      latestPatches = initialStrokes.map((s) => {
        const nextPoints = scalePointsFromOrigin(s.points, originX, originY, scaleX, scaleY);
        const nextSize = Math.max(1.5, Math.min(48, Math.round(s.size * avgScale * 10) / 10));
        return {
          strokeId: s.id,
          points: nextPoints,
          size: nextSize,
          bbox: computeBBox(nextPoints)
        };
      });
      onTransformStrokes(latestPatches, false);
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      if (moved && latestPatches.length > 0) {
        onTransformStrokes(latestPatches, true);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  if (!visible) return null;

  return (
    <>
      <svg className={styles.doodleLayer} aria-hidden="true">
        {visibleStrokes.map((stroke) => (
          <path
            key={stroke.id}
            d={pointsToSvgPath(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.size}
            strokeOpacity={stroke.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={stroke.tool === 'highlighter' ? styles.highlighterStroke : undefined}
          />
        ))}

        {remoteLiveStrokes.map((stroke) => (
          <path
            key={`live-${stroke.strokeId}`}
            d={pointsToSvgPath(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.size}
            strokeOpacity={stroke.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={stroke.tool === 'highlighter' ? styles.highlighterStroke : undefined}
          />
        ))}

        {/* Imperatively updated local active stroke for zero-lag 60fps drawing */}
        <path
          ref={activePathRef}
          d=""
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {selectMode && marqueeRect ? (
        <div
          className={styles.doodleMarquee}
          style={{
            transform: `translate3d(${marqueeRect.minX}px, ${marqueeRect.minY}px, 0)`,
            width: Math.max(1, marqueeRect.maxX - marqueeRect.minX),
            height: Math.max(1, marqueeRect.maxY - marqueeRect.minY)
          }}
          aria-hidden="true"
        />
      ) : null}

      {selectMode && selectionBox && selectedStrokes.length > 0 ? (
        <div
          className={styles.doodleSelectionBox}
          style={{
            transform: `translate3d(${selectionBox.minX}px, ${selectionBox.minY}px, 0)`,
            width: Math.max(20, selectionBox.maxX - selectionBox.minX),
            height: Math.max(20, selectionBox.maxY - selectionBox.minY)
          }}
          onPointerDown={handleMovePointerDown}
        >
          <div
            className={styles.itemActionBar}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {selectedStrokes.length > 1 ? (
              <span className={styles.doodleSelectionCount}>已选 {selectedStrokes.length} 笔</span>
            ) : null}
            <Tooltip title="删除选中涂鸦">
              <Button
                variant="ghost"
                size="sm"
                aria-label="删除选中涂鸦"
                icon={<Icon name="trash" size="sm" tone="danger" />}
                onClick={() => onDeleteStrokes(selectedStrokes.map((s) => s.id))}
              />
            </Tooltip>
          </div>

          <Button
            variant="ghost"
            data-ui-surface=""
            type="button"
            className={styles.resizeHandle}
            aria-label="缩放选中涂鸦"
            title="拖动缩放涂鸦"
            onPointerDown={handleScalePointerDown}
          />
        </div>
      ) : null}
    </>
  );
}
