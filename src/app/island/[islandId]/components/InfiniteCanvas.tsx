'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { Icon } from '@/components/ui/icon';
import { clipboardImages } from '@/lib/clipboardImages';
import type { IslandItem, IslandItemData, IslandOnlineUser } from '../../core/types';
import type { IslandPoint } from '../../core/socket';
import { CanvasItem } from './CanvasItem';
import { PresenceLayer } from './PresenceLayer';
import styles from '../island-canvas.module.css';

export const MIN_CANVAS_SCALE = 0.35;
export const MAX_CANVAS_SCALE = 2.0;

export interface CanvasViewportState {
  x: number;
  y: number;
  scale: number;
}

interface InfiniteCanvasProps {
  items: IslandItem[];
  onlineUsers: IslandOnlineUser[];
  selfSocketId: string | null;
  selfColor: string;
  currentPublicKey: string;
  isOwner: boolean;
  isAdmin: boolean;
  canEditBoard: boolean;
  selectedItemId: string | null;
  viewport: CanvasViewportState;
  smoothViewport: boolean;
  onViewportChange: (next: CanvasViewportState) => void;
  onSelectItem: (itemId: string | null) => void;
  onCursorMove: (worldPoint: IslandPoint, viewportCenter: IslandPoint) => void;
  onLockItem: (itemId: string | null) => void;
  onMoveItem: (
    itemId: string,
    patch: { x: number; y: number; w?: number; h?: number; rotation?: number; zIndex?: number; persist: boolean }
  ) => void;
  onUpdateItemData: (item: IslandItem, data: IslandItemData) => void;
  onBringToFront: (itemId: string) => void;
  onSendToBack: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onPasteText: (text: string, worldPos: IslandPoint) => void;
  onUploadFiles: (files: File[], worldPos: IslandPoint) => void;
}

const EMPTY_FOCUSED_USERS: IslandOnlineUser[] = [];

export function clampScale(scale: number): number {
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, Math.round(scale * 1000) / 1000));
}

export function InfiniteCanvas({
  items,
  onlineUsers,
  selfSocketId,
  selfColor,
  currentPublicKey,
  isOwner,
  isAdmin,
  canEditBoard,
  selectedItemId,
  viewport,
  smoothViewport,
  onViewportChange,
  onSelectItem,
  onCursorMove,
  onLockItem,
  onMoveItem,
  onUpdateItemData,
  onBringToFront,
  onSendToBack,
  onDeleteItem,
  onPasteText,
  onUploadFiles
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [dragOverFiles, setDragOverFiles] = useState(false);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Multi-touch pointer tracking for pinch-to-zoom & 1-finger pan
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const panAnchor = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchAnchor = useRef<{
    distance: number;
    midX: number;
    midY: number;
    worldMidX: number;
    worldMidY: number;
    startScale: number;
  } | null>(null);

  const screenToWorld = useCallback((clientX: number, clientY: number): IslandPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left || 0);
    const sy = clientY - (rect?.top || 0);
    const vp = viewportRef.current;
    return {
      x: (sx - vp.x) / vp.scale,
      y: (sy - vp.y) / vp.scale
    };
  }, []);

  const getViewportCenterWorld = useCallback((): IslandPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 1000);
    const h = rect?.height || (typeof window !== 'undefined' ? window.innerHeight : 700);
    const vp = viewportRef.current;
    return {
      x: (w / 2 - vp.x) / vp.scale,
      y: (h / 2 - vp.y) / vp.scale
    };
  }, []);

  // Spacebar pan mode
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditable(event.target)) {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePressed(false);
      }
    };
    const handleBlur = () => setSpacePressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Wheel zoom around cursor (native non-passive listener)
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const vp = viewportRef.current;

      const factor = event.ctrlKey
        ? Math.exp(-event.deltaY * 0.01)
        : event.deltaY < 0
          ? 1.09
          : 1 / 1.09;
      const nextScale = clampScale(vp.scale * factor);
      if (nextScale === vp.scale) return;

      const worldX = (sx - vp.x) / vp.scale;
      const worldY = (sy - vp.y) / vp.scale;
      onViewportChange({
        scale: nextScale,
        x: sx - worldX * nextScale,
        y: sy - worldY * nextScale
      });
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [onViewportChange]);

  // Global paste: images -> Polaroid, plain text -> Sticky Note
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!canEditBoard) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      const data = event.clipboardData;
      if (!data) return;

      const images = clipboardImages(data);
      if (images.length > 0) {
        event.preventDefault();
        onUploadFiles(images, getViewportCenterWorld());
        return;
      }

      const plainText = data.getData('text/plain').trim();
      if (plainText) {
        event.preventDefault();
        onPasteText(plainText, getViewportCenterWorld());
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canEditBoard, getViewportCenterWorld, onPasteText, onUploadFiles]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.current.size === 1) {
      onSelectItem(null);
      panAnchor.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewportRef.current.x,
        originY: viewportRef.current.y
      };
      pinchAnchor.current = null;
      setIsPanning(true);
    } else if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = target.getBoundingClientRect();
      const localMidX = midX - rect.left;
      const localMidY = midY - rect.top;
      const vp = viewportRef.current;

      pinchAnchor.current = {
        distance: dist,
        midX: localMidX,
        midY: localMidY,
        worldMidX: (localMidX - vp.x) / vp.scale,
        worldMidY: (localMidY - vp.y) / vp.scale,
        startScale: vp.scale
      };
      panAnchor.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const worldPt = screenToWorld(event.clientX, event.clientY);
    onCursorMove(worldPt, getViewportCenterWorld());

    if (!activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.current.size === 2 && pinchAnchor.current) {
      const pts = Array.from(activePointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const rect = event.currentTarget.getBoundingClientRect();
      const localMidX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const localMidY = (pts[0].y + pts[1].y) / 2 - rect.top;

      const anchor = pinchAnchor.current;
      const nextScale = clampScale(anchor.startScale * (dist / anchor.distance));
      onViewportChange({
        scale: nextScale,
        x: localMidX - anchor.worldMidX * nextScale,
        y: localMidY - anchor.worldMidY * nextScale
      });
      return;
    }

    if (panAnchor.current && panAnchor.current.pointerId === event.pointerId) {
      const dx = event.clientX - panAnchor.current.startX;
      const dy = event.clientY - panAnchor.current.startY;
      onViewportChange({
        scale: viewportRef.current.scale,
        x: panAnchor.current.originX + dx,
        y: panAnchor.current.originY + dy
      });
    }
  };

  const handlePointerUpOrCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointers.current.size === 1) {
      const [remainingId, pt] = Array.from(activePointers.current.entries())[0];
      panAnchor.current = {
        pointerId: remainingId,
        startX: pt.x,
        startY: pt.y,
        originX: viewportRef.current.x,
        originY: viewportRef.current.y
      };
      pinchAnchor.current = null;
    } else if (activePointers.current.size === 0) {
      panAnchor.current = null;
      pinchAnchor.current = null;
      setIsPanning(false);
    }
  };

  // Drag & drop local images
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!canEditBoard) return;
    if (Array.from(event.dataTransfer.types || []).includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!dragOverFiles) setDragOverFiles(true);
    }
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOverFiles(false);
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverFiles(false);
    if (!canEditBoard) return;

    const files = Array.from(event.dataTransfer.files || []).filter(
      (file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name)
    );
    if (files.length > 0) {
      onUploadFiles(files, screenToWorld(event.clientX, event.clientY));
    }
  };

  // Map lockedItemId -> remote user
  const lockedByMap = useMemo(() => {
    const map = new Map<string, IslandOnlineUser>();
    for (const user of onlineUsers) {
      if (user.socketId !== selfSocketId && user.lockedItemId) {
        map.set(user.lockedItemId, user);
      }
    }
    return map;
  }, [onlineUsers, selfSocketId]);

  // Map focusedItemId -> remote users (deduplicated per person)
  const focusedByMap = useMemo(() => {
    const map = new Map<string, IslandOnlineUser[]>();
    for (const user of onlineUsers) {
      if (user.socketId === selfSocketId || !user.focusedItemId) continue;
      const list = map.get(user.focusedItemId) || [];
      if (!list.some((existing) => existing.publicKey === user.publicKey)) {
        list.push(user);
        map.set(user.focusedItemId, list);
      }
    }
    return map;
  }, [onlineUsers, selfSocketId]);

  const gridSize = Math.max(14, Math.round(28 * viewport.scale));

  return (
    <div
      ref={containerRef}
      className={[
        styles.canvasViewport,
        isPanning || spacePressed ? styles.canvasViewportPanning : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={[styles.worldLayer, smoothViewport ? styles.worldLayerSmooth : '']
          .filter(Boolean)
          .join(' ')}
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`
        }}
      >
        {/* Island center (0, 0) subtle landmark */}
        <div className={styles.islandOrigin}>
          <span className={styles.islandOriginLabel}>浮岛中心</span>
        </div>

        {items.map((item) => {
          const canArrangeItem = canEditBoard || isAdmin;
          const canEditItem =
            canEditBoard && (isOwner || isAdmin || item.authorPublicKey === currentPublicKey);
          return (
            <CanvasItem
              key={item.id}
              item={item}
              scale={viewport.scale}
              isSelected={selectedItemId === item.id}
              selfColor={selfColor}
              canArrange={canArrangeItem}
              canEdit={canEditItem}
              lockedBy={lockedByMap.get(item.id) || null}
              focusedBy={focusedByMap.get(item.id) || EMPTY_FOCUSED_USERS}
              spacePressed={spacePressed}
              onSelect={(id) => onSelectItem(id)}
              onLock={onLockItem}
              onMove={onMoveItem}
              onUpdateData={onUpdateItemData}
              onBringToFront={onBringToFront}
              onSendToBack={onSendToBack}
              onDelete={onDeleteItem}
            />
          );
        })}

        <PresenceLayer onlineUsers={onlineUsers} selfSocketId={selfSocketId} />
      </div>

      {dragOverFiles ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropOverlayText}>
            <Icon name="picture" size="lg" tone="primary" />
            <span>松手将图片贴成拍立得</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
