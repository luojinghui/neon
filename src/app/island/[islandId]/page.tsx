'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/topbar';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Icon } from '@/components/ui/icon';
import { message } from '@/components/ui/message';
import { Tooltip } from '@/components/ui/tooltip';
import { ensureCurrentProfile } from '@/app/profile/client';
import { IslandSettingsModal } from '../components/IslandSettingsModal';
import {
  buildInviteLink,
  getIslandCacheUuid,
  getIslandDetail,
  IslandApiError,
  uploadIslandMedia
} from '../core/client';
import { readCachedIsland, writeCachedIsland } from '../core/islandCache';
import { IslandSocketClient, resolveIslandSocketUuid, type IslandPoint } from '../core/socket';
import {
  pickIslandMemberColor,
  type IslandDetail,
  type IslandItem,
  type IslandItemData,
  type IslandOnlineUser,
  type NoteColorKey
} from '../core/types';
import { clampScale, InfiniteCanvas, type CanvasViewportState } from './components/InfiniteCanvas';
import { IslandToolbar } from './components/IslandToolbar';
import { STICKER_PRESETS, TAPE_PRESETS } from './components/StickerItem';
import styles from './island-canvas.module.css';

const NOTE_PALETTE: NoteColorKey[] = ['sun', 'sky', 'blush', 'mint', 'lavender'];

function formatTodayLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function getCenteredViewport(worldX = 0, worldY = 0, scale = 1): CanvasViewportState {
  if (typeof window === 'undefined') return { x: 400, y: 300, scale };
  return {
    x: window.innerWidth / 2 - worldX * scale,
    y: window.innerHeight / 2 - worldY * scale,
    scale
  };
}

export default function IslandBoardPage() {
  const params = useParams<{ islandId: string }>();
  const islandId = typeof params?.islandId === 'string' ? params.islandId : '';

  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ title: string; desc: string } | null>(null);
  const [island, setIsland] = useState<IslandDetail | null>(null);
  const [items, setItems] = useState<IslandItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<IslandOnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [selfSocketId, setSelfSocketId] = useState<string | null>(null);
  const [currentPublicKey, setCurrentPublicKey] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [viewport, setViewport] = useState<CanvasViewportState>(() => getCenteredViewport(0, 0, 1));
  const [smoothViewport, setSmoothViewport] = useState(false);
  const smoothTimerRef = useRef<number | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const socketRef = useRef<IslandSocketClient | null>(null);
  const itemsRef = useRef<IslandItem[]>([]);
  itemsRef.current = items;
  const selectedItemIdRef = useRef<string | null>(null);
  selectedItemIdRef.current = selectedItemId;

  const animateViewportTo = useCallback((next: CanvasViewportState) => {
    setSmoothViewport(true);
    setViewport(next);
    if (smoothTimerRef.current !== null) {
      window.clearTimeout(smoothTimerRef.current);
    }
    smoothTimerRef.current = window.setTimeout(() => {
      smoothTimerRef.current = null;
      setSmoothViewport(false);
    }, 380);
  }, []);

  const handleViewportChange = useCallback((next: CanvasViewportState) => {
    if (smoothTimerRef.current !== null) {
      window.clearTimeout(smoothTimerRef.current);
      smoothTimerRef.current = null;
    }
    setSmoothViewport(false);
    setViewport(next);
  }, []);

  // Center initial viewport on mount
  useEffect(() => {
    setViewport(getCenteredViewport(0, 0, 1));
    return () => {
      if (smoothTimerRef.current !== null) {
        window.clearTimeout(smoothTimerRef.current);
      }
    };
  }, []);

  // Load island detail + connect Socket.io
  useEffect(() => {
    if (!islandId) return;
    let active = true;
    const client = new IslandSocketClient();
    socketRef.current = client;

    const init = async () => {
      const cacheUuid = getIslandCacheUuid();
      const cached = readCachedIsland(cacheUuid, islandId);
      if (cached) {
        setIsland(cached);
        setItems(cached.items || []);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setErrorState(null);

      try {
        const [profile, detailRes] = await Promise.all([
          ensureCurrentProfile().catch(() => null),
          getIslandDetail(islandId)
        ]);
        if (!active) return;

        const detail = detailRes.island;
        setCurrentPublicKey(profile?.publicKey || '');
        setIsland(detail);
        setItems(detail.items || []);
        setLoading(false);
        writeCachedIsland(profile?.uuid || cacheUuid, detail);

        const uuid = profile?.uuid || (await resolveIslandSocketUuid());
        if (!active) return;

        await client.connect(uuid);
        if (!active) return;

        setConnected(true);
        setSelfSocketId(client.getSocketId());

        const unsubs = [
          client.onConnectionChange((isConn) => {
            setConnected(isConn);
            if (isConn) {
              setSelfSocketId(client.getSocketId());
              void client
                .joinIsland(islandId)
                .then((res) => {
                  if (!active) return;
                  setOnlineUsers(res.onlineUsers);
                  if (res.items) setItems(res.items);
                  if (selectedItemIdRef.current) {
                    client.focusItem(islandId, selectedItemIdRef.current);
                  }
                })
                .catch(() => undefined);
            }
          }),
          client.onPresence((users) => {
            setOnlineUsers(users);
          }),
          client.onCursor((evt) => {
            setOnlineUsers((prev) =>
              prev.map((user) =>
                user.socketId === evt.socketId
                  ? {
                      ...user,
                      cursor: evt.cursor,
                      viewportCenter: evt.viewportCenter ?? user.viewportCenter
                    }
                  : user
              )
            );
          }),
          client.onItemLocked((evt) => {
            setOnlineUsers((prev) =>
              prev.map((user) =>
                user.socketId === evt.socketId ? { ...user, lockedItemId: evt.itemId } : user
              )
            );
          }),
          client.onItemUpserted((upserted) => {
            setItems((prev) => {
              const exists = prev.some((it) => it.id === upserted.id);
              if (exists) {
                return prev.map((it) => (it.id === upserted.id ? upserted : it));
              }
              return [...prev, upserted];
            });
          }),
          client.onItemMoved((evt) => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === evt.itemId
                  ? {
                      ...it,
                      x: evt.x,
                      y: evt.y,
                      w: evt.w ?? it.w,
                      h: evt.h ?? it.h,
                      rotation: evt.rotation ?? it.rotation,
                      zIndex: evt.zIndex ?? it.zIndex,
                      updatedAt: evt.updatedAt ?? it.updatedAt
                    }
                  : it
              )
            );
          }),
          client.onItemDeleted(({ itemId }) => {
            setItems((prev) => prev.filter((it) => it.id !== itemId));
            setSelectedItemId((curr) => (curr === itemId ? null : curr));
          }),
          client.onIslandUpdated((patch) => {
            setIsland((prev) => (prev ? { ...prev, ...patch } : prev));
          }),
          client.onKicked((evt) => {
            if (evt.islandId === islandId) {
              setErrorState({
                title: '已离开这座浮岛',
                desc: evt.reason || '岛主已调整成员列表，你暂时无法继续访问此浮岛。'
              });
            }
          })
        ];

        const joinRes = await client.joinIsland(islandId);
        if (!active) {
          unsubs.forEach((fn) => fn());
          return;
        }
        setOnlineUsers(joinRes.onlineUsers);
        if (joinRes.items) setItems(joinRes.items);
        if (typeof joinRes.canEdit === 'boolean') {
          setIsland((prev) => (prev ? { ...prev, canEdit: joinRes.canEdit! } : prev));
        }
      } catch (err) {
        if (!active) return;
        setLoading(false);
        if (err instanceof IslandApiError) {
          if (err.status === 403 || err.status === 401) {
            setErrorState({
              title: '还没有登岛权限',
              desc: err.message || '请通过岛主的邀请链接与登岛密码加入这座浮岛。'
            });
          } else if (err.status === 404) {
            setErrorState({
              title: '未找到这座浮岛',
              desc: '它可能已消失在云海里，返回天空群岛看看吧。'
            });
          } else {
            setErrorState({
              title: '无法进入浮岛',
              desc: err.message || '加载失败，请稍后重试。'
            });
          }
        } else {
          // If island already loaded but socket failed, keep board visible with offline dot
          setConnected(false);
          if (!itemsRef.current.length) {
            message.warning(err instanceof Error ? err.message : '协同连接暂不可用');
          }
        }
      }
    };

    void init();

    return () => {
      active = false;
      void client.leaveIsland(islandId);
      client.disconnect();
      socketRef.current = null;
    };
  }, [islandId]);

  const maxZIndex = useMemo(
    () => items.reduce((max, it) => Math.max(max, it.zIndex || 1), 1),
    [items]
  );

  const minZIndex = useMemo(
    () => items.reduce((min, it) => Math.min(min, it.zIndex || 1), 1),
    [items]
  );

  const getCenterWorld = useCallback((): IslandPoint => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const h = typeof window !== 'undefined' ? window.innerHeight : 700;
    return {
      x: (w / 2 - viewport.x) / viewport.scale,
      y: (h / 2 - viewport.y) / viewport.scale
    };
  }, [viewport]);

  const handleCursorMove = useCallback(
    (worldPt: IslandPoint, viewportCenter: IslandPoint) => {
      socketRef.current?.sendCursor(islandId, worldPt.x, worldPt.y, viewportCenter);
    },
    [islandId]
  );

  const handleLockItem = useCallback(
    (itemId: string | null) => {
      socketRef.current?.lockItem(islandId, itemId);
    },
    [islandId]
  );

  const handleMoveItem = useCallback(
    (
      itemId: string,
      patch: {
        x: number;
        y: number;
        w?: number;
        h?: number;
        rotation?: number;
        zIndex?: number;
        persist: boolean;
      }
    ) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                x: patch.x,
                y: patch.y,
                w: patch.w ?? it.w,
                h: patch.h ?? it.h,
                rotation: patch.rotation ?? it.rotation,
                zIndex: patch.zIndex ?? it.zIndex
              }
            : it
        )
      );

      void socketRef.current
        ?.moveItem(islandId, { itemId, ...patch })
        .catch((err) => {
          if (patch.persist) {
            message.error(err instanceof Error ? err.message : '同步位置失败');
          }
        });
    },
    [islandId]
  );

  const handleUpdateItemData = useCallback(
    (item: IslandItem, data: IslandItemData) => {
      const updatedLocal: IslandItem = { ...item, data };
      setItems((prev) => prev.map((it) => (it.id === item.id ? updatedLocal : it)));

      void socketRef.current
        ?.upsertItem(islandId, {
          id: item.id,
          type: item.type,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          rotation: item.rotation,
          zIndex: item.zIndex,
          data
        })
        .then((saved) => {
          setItems((prev) => prev.map((it) => (it.id === saved.id ? saved : it)));
        })
        .catch((err) => {
          message.error(err instanceof Error ? err.message : '保存失败');
        });
    },
    [islandId]
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      const backup = itemsRef.current;
      setItems((prev) => prev.filter((it) => it.id !== itemId));
      setSelectedItemId((curr) => (curr === itemId ? null : curr));

      void socketRef.current?.deleteItem(islandId, itemId).catch((err) => {
        setItems(backup);
        message.error(err instanceof Error ? err.message : '删除失败');
      });
    },
    [islandId]
  );

  const handleBringToFront = useCallback(
    (itemId: string) => {
      const target = itemsRef.current.find((it) => it.id === itemId);
      if (!target) return;
      handleMoveItem(itemId, {
        x: target.x,
        y: target.y,
        zIndex: maxZIndex + 1,
        persist: true
      });
    },
    [handleMoveItem, maxZIndex]
  );

  const handleSendToBack = useCallback(
    (itemId: string) => {
      const target = itemsRef.current.find((it) => it.id === itemId);
      if (!target) return;
      handleMoveItem(itemId, {
        x: target.x,
        y: target.y,
        zIndex: Math.max(0, minZIndex - 1),
        persist: true
      });
    },
    [handleMoveItem, minZIndex]
  );

  const createItem = useCallback(
    async (
      type: IslandItem['type'],
      w: number,
      h: number,
      data: IslandItemData,
      center?: IslandPoint
    ) => {
      if (!island?.canEdit) {
        message.warning('当前浮岛为只读模式');
        return;
      }
      const pos = center || getCenterWorld();
      const jitterX = (Math.random() - 0.5) * 40;
      const jitterY = (Math.random() - 0.5) * 40;
      const rotation = type === 'polaroid' || type === 'note' ? Math.round((Math.random() - 0.5) * 6) : 0;

      try {
        const saved = await socketRef.current?.upsertItem(islandId, {
          type,
          x: Math.round(pos.x - w / 2 + jitterX),
          y: Math.round(pos.y - h / 2 + jitterY),
          w,
          h,
          rotation,
          zIndex: maxZIndex + 1,
          data
        });
        if (saved) {
          setItems((prev) =>
            prev.some((it) => it.id === saved.id)
              ? prev.map((it) => (it.id === saved.id ? saved : it))
              : [...prev, saved]
          );
          setSelectedItemId(saved.id);
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : '添加失败，请检查网络连接');
      }
    },
    [getCenterWorld, island?.canEdit, islandId, maxZIndex]
  );

  const handleAddNote = useCallback(
    (text = '', center?: IslandPoint) => {
      const color = NOTE_PALETTE[itemsRef.current.length % NOTE_PALETTE.length];
      void createItem('note', 220, 200, { text, color }, center);
    },
    [createItem]
  );

  const handleUploadFiles = useCallback(
    async (files: File[], center?: IslandPoint) => {
      if (!island?.canEdit) {
        message.warning('当前浮岛为只读模式');
        return;
      }
      setUploading(true);
      const basePos = center || getCenterWorld();
      let index = 0;

      try {
        for (const file of files.slice(0, 6)) {
          const { url } = await uploadIslandMedia(islandId, file);
          await createItem(
            'polaroid',
            232,
            280,
            {
              imageUrl: url,
              caption: '',
              dateLabel: formatTodayLabel()
            },
            { x: basePos.x + index * 28, y: basePos.y + index * 24 }
          );
          index += 1;
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : '图片上传失败');
      } finally {
        setUploading(false);
      }
    },
    [createItem, getCenterWorld, island?.canEdit, islandId]
  );

  const handleAddSticker = useCallback(
    (presetId: string) => {
      const preset = STICKER_PRESETS.find((p) => p.id === presetId) || STICKER_PRESETS[0];
      void createItem('sticker', preset.defaultW, preset.defaultH, { presetId: preset.id });
    },
    [createItem]
  );

  const handleAddTape = useCallback(
    (presetId: string) => {
      const preset = TAPE_PRESETS.find((p) => p.id === presetId) || TAPE_PRESETS[0];
      void createItem('tape', preset.defaultW, preset.defaultH, { presetId: preset.id });
    },
    [createItem]
  );

  // Keyboard Delete/Backspace & Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        setSelectedItemId(null);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItemId && island?.canEdit) {
        const target = itemsRef.current.find((it) => it.id === selectedItemId);
        if (
          target &&
          (island.isOwner || island.isAdmin || target.authorPublicKey === currentPublicKey)
        ) {
          event.preventDefault();
          handleDeleteItem(selectedItemId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPublicKey, handleDeleteItem, island, selectedItemId]);

  // Zoom controls centered on screen center
  const zoomBy = useCallback(
    (factor: number) => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1000;
      const h = typeof window !== 'undefined' ? window.innerHeight : 700;
      const nextScale = clampScale(viewport.scale * factor);
      const worldX = (w / 2 - viewport.x) / viewport.scale;
      const worldY = (h / 2 - viewport.y) / viewport.scale;
      animateViewportTo({
        scale: nextScale,
        x: w / 2 - worldX * nextScale,
        y: h / 2 - worldY * nextScale
      });
    },
    [animateViewportTo, viewport]
  );

  const handleResetZoom = useCallback(() => {
    const center = getCenterWorld();
    animateViewportTo(getCenteredViewport(center.x, center.y, 1));
  }, [animateViewportTo, getCenterWorld]);

  const handleResetView = useCallback(() => {
    animateViewportTo(getCenteredViewport(0, 0, 1));
  }, [animateViewportTo]);

  // Sync focused/selected item to peers so each person's focus is marked with their color
  useEffect(() => {
    if (!connected) return;
    socketRef.current?.focusItem(islandId, selectedItemId);
  }, [connected, islandId, selectedItemId]);

  const selfColor = useMemo(() => {
    const selfUser = onlineUsers.find((u) => u.socketId === selfSocketId);
    return selfUser?.color || pickIslandMemberColor(currentPublicKey);
  }, [currentPublicKey, onlineUsers, selfSocketId]);

  const resolvedItems = useMemo(() => {
    const nameByPublicKey = new Map<string, string>();
    if (island?.owner?.publicKey && island.owner.name) {
      nameByPublicKey.set(island.owner.publicKey, island.owner.name);
    }
    for (const member of island?.members || []) {
      if (member.publicKey && member.name) {
        nameByPublicKey.set(member.publicKey, member.name);
      }
    }
    for (const user of onlineUsers) {
      if (user.publicKey && user.name) {
        nameByPublicKey.set(user.publicKey, user.name);
      }
    }
    return items.map((item) => {
      const latestName = nameByPublicKey.get(item.authorPublicKey);
      if (!latestName || latestName === item.authorName) return item;
      return { ...item, authorName: latestName };
    });
  }, [island?.members, island?.owner, items, onlineUsers]);

  // Keep local cache fresh for instant subsequent loads
  useEffect(() => {
    if (!island) return;
    writeCachedIsland(getIslandCacheUuid(), { ...island, items });
  }, [island, items]);

  const handleCopyInvite = useCallback(async () => {
    if (!island?.inviteToken) return;
    try {
      await navigator.clipboard.writeText(buildInviteLink(island.inviteToken));
      message.success('已复制邀请链接');
    } catch {
      message.error('复制失败');
    }
  }, [island]);

  if (loading) {
    return (
      <main className={styles.pageShell}>
        <TopBar backHref="/island" backLabel="天空群岛" middle="正在登岛..." />
        <div className={styles.stateCenter}>
          <Icon name="loading" size="lg" tone="primary" label="正在加载浮岛" />
          <p className={styles.stateDesc}>正在连接浮岛画板...</p>
        </div>
      </main>
    );
  }

  if (errorState || !island) {
    return (
      <main className={styles.pageShell}>
        <TopBar backHref="/island" backLabel="天空群岛" middle="浮岛" />
        <div className={styles.stateCenter}>
          <div className={styles.stateCard}>
            <Icon name="lock" size={28} tone="primary" />
            <h1 className={styles.stateTitle}>{errorState?.title || '无法访问浮岛'}</h1>
            <p className={styles.stateDesc}>{errorState?.desc || '请返回天空群岛重新进入。'}</p>
            <Link href="/island" className={buttonClassName({ variant: 'primary' })}>
              返回天空群岛
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const visibleOnlinePeers = onlineUsers.filter((u) => u.socketId !== selfSocketId);

  return (
    <main className={styles.pageShell}>
      <TopBar
        backHref="/island"
        backLabel="天空群岛"
        middle={
          <div className={styles.topBarTitleWrap}>
            <span
              className={[styles.statusDot, !connected ? styles.statusDotOffline : '']
                .filter(Boolean)
                .join(' ')}
              title={connected ? '实时协同已连接' : '连接中断，正在重连'}
            />
            <span className={styles.topBarTitle}>{island.name}</span>
            {!island.canEdit ? <span className={styles.readOnlyTag}>只读</span> : null}
          </div>
        }
        right={
          <div className="flex items-center gap-1.5">
            {visibleOnlinePeers.length > 0 ? (
              <div className={styles.onlineStack} aria-label="在线好友">
                {visibleOnlinePeers.slice(0, 5).map((peer) => (
                  <Tooltip key={peer.socketId} title={`${peer.name || '好友'} 在线`}>
                    <span
                      className={styles.avatarChip}
                      style={{ '--member-color': peer.color || 'hsl(var(--primary))' } as CSSProperties}
                      aria-label={`${peer.name || '好友'} 在线`}
                    >
                      {peer.avatarUrl ? (
                        <img src={peer.avatarUrl} alt={peer.name || '好友头像'} />
                      ) : (
                        <span>{(peer.name || '友').slice(0, 1)}</span>
                      )}
                    </span>
                  </Tooltip>
                ))}
              </div>
            ) : null}

            {island.isOwner && island.inviteToken ? (
              <Tooltip title="复制邀请链接">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="复制邀请链接"
                  icon={<Icon name="link" size="sm" />}
                  onClick={() => void handleCopyInvite()}
                />
              </Tooltip>
            ) : null}

            {island.isOwner ? (
              <Tooltip title="浮岛设置">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="打开浮岛设置"
                  icon={<Icon name="setting" size="sm" />}
                  onClick={() => setSettingsOpen(true)}
                />
              </Tooltip>
            ) : null}
          </div>
        }
      />

      <InfiniteCanvas
        items={resolvedItems}
        onlineUsers={onlineUsers}
        selfSocketId={selfSocketId}
        selfColor={selfColor}
        currentPublicKey={currentPublicKey}
        isOwner={island.isOwner}
        isAdmin={Boolean(island.isAdmin)}
        canEditBoard={island.canEdit}
        selectedItemId={selectedItemId}
        viewport={viewport}
        smoothViewport={smoothViewport}
        onViewportChange={handleViewportChange}
        onSelectItem={setSelectedItemId}
        onCursorMove={handleCursorMove}
        onLockItem={handleLockItem}
        onMoveItem={handleMoveItem}
        onUpdateItemData={handleUpdateItemData}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onDeleteItem={handleDeleteItem}
        onPasteText={(text, pos) => handleAddNote(text, pos)}
        onUploadFiles={(files, pos) => void handleUploadFiles(files, pos)}
      />

      <IslandToolbar
        canEdit={island.canEdit}
        uploading={uploading}
        scale={viewport.scale}
        onAddNote={() => handleAddNote()}
        onUploadFiles={(files) => void handleUploadFiles(files)}
        onAddSticker={handleAddSticker}
        onAddTape={handleAddTape}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onResetZoom={handleResetZoom}
        onResetView={handleResetView}
      />

      <IslandSettingsModal
        open={settingsOpen}
        island={island}
        onClose={() => setSettingsOpen(false)}
        onUpdated={(updated) => {
          setIsland((prev) => (prev ? { ...prev, ...updated } : prev));
        }}
      />
    </main>
  );
}
