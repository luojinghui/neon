'use client';

import { io, type Socket } from 'socket.io-client';
import { subscribeAdminSessionChanges } from '@/app/admin/sessionEvents';
import { ensureCurrentProfile, getOrCreateIdentity } from '@/app/profile/client';
import type { IslandItem, IslandItemData, IslandItemType, IslandOnlineUser, IslandSummary } from './types';

type Ack<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; data?: unknown };
type Unsubscribe = () => void;

export interface IslandPoint {
  x: number;
  y: number;
}

export interface IslandJoinResult {
  onlineUsers: IslandOnlineUser[];
  items?: IslandItem[];
  canEdit?: boolean;
}

export interface IslandItemUpsertInput {
  id?: string;
  type: IslandItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  data: IslandItemData;
}

export interface IslandItemMovePatch {
  itemId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  zIndex?: number;
  persist?: boolean;
}

export interface IslandCursorEvent {
  islandId?: string;
  socketId: string;
  publicKey?: string;
  cursor: IslandPoint | null;
  viewportCenter?: IslandPoint | null;
}

export interface IslandItemLockedEvent {
  islandId?: string;
  socketId: string;
  publicKey?: string;
  itemId: string | null;
}

export interface IslandItemMovedEvent {
  islandId?: string;
  itemId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  zIndex?: number;
  updatedAt?: string;
}

export interface IslandKickedEvent {
  islandId: string;
  reason?: string;
}

export class IslandSocketError extends Error {
  constructor(
    message: string,
    public readonly code = '',
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'IslandSocketError';
  }
}

export async function resolveIslandSocketUuid(): Promise<string> {
  try {
    const profile = await ensureCurrentProfile();
    return profile.uuid;
  } catch {
    return getOrCreateIdentity().uuid;
  }
}

const THROTTLE_MS = 50;

export class IslandSocketClient {
  private socket: Socket | null = null;
  private unsubscribeAdminSession: Unsubscribe | null = null;

  private lastCursorSentAt = 0;
  private cursorTimer: number | null = null;
  private pendingCursorPayload: {
    islandId: string;
    x: number;
    y: number;
    viewportCenter?: IslandPoint;
  } | null = null;

  private lastMoveSentAt = new Map<string, number>();
  private moveTimers = new Map<string, number>();
  private pendingMovePayloads = new Map<string, { islandId: string; patch: IslandItemMovePatch }>();

  public connect(uuid: string): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();
    if (!this.socket) {
      this.socket = io({
        path: '/im',
        autoConnect: false,
        transports: ['websocket', 'polling'],
        auth: { uuid, user: { uuid } }
      });
      this.unsubscribeAdminSession = subscribeAdminSessionChanges(() => {
        this.socket?.disconnect().connect();
      });
    } else {
      this.socket.auth = { uuid, user: { uuid } };
    }

    return new Promise((resolve, reject) => {
      const socket = this.requireSocket();
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('连接浮岛协同服务超时'));
      }, 8000);
      const cleanup = () => {
        window.clearTimeout(timer);
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleError);
      };
      const handleConnect = () => {
        cleanup();
        resolve();
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(new Error(error.message || '浮岛协同服务连接失败'));
      };

      socket.once('connect', handleConnect);
      socket.once('connect_error', handleError);
      socket.connect();
    });
  }

  public disconnect(): void {
    this.clearThrottleTimers();
    this.unsubscribeAdminSession?.();
    this.unsubscribeAdminSession = null;
    this.socket?.disconnect();
    this.socket = null;
  }

  public getSocketId(): string | null {
    return this.socket?.id ?? null;
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public joinIsland(islandId: string): Promise<IslandJoinResult> {
    return this.emitWithAck<IslandJoinResult | { users?: IslandOnlineUser[]; items?: IslandItem[]; canEdit?: boolean }>(
      'island:join',
      { islandId }
    ).then((raw) => {
      const onlineUsers = Array.isArray((raw as IslandJoinResult)?.onlineUsers)
        ? (raw as IslandJoinResult).onlineUsers
        : Array.isArray((raw as { users?: IslandOnlineUser[] })?.users)
          ? (raw as { users: IslandOnlineUser[] }).users
          : [];
      return {
        onlineUsers,
        items: Array.isArray(raw?.items) ? raw.items : undefined,
        canEdit: typeof raw?.canEdit === 'boolean' ? raw.canEdit : undefined
      };
    });
  }

  public leaveIsland(islandId: string): Promise<void> {
    this.clearThrottleTimers();
    if (!this.socket?.connected) return Promise.resolve();
    return this.emitWithAck<unknown>('island:leave', { islandId })
      .then(() => undefined)
      .catch(() => undefined);
  }

  /** Throttled to 50ms to keep real-time cursor presence smooth without flooding. */
  public sendCursor(islandId: string, x: number, y: number, viewportCenter?: IslandPoint): void {
    if (!this.socket?.connected) return;
    const payload = {
      islandId,
      x: Math.round(x),
      y: Math.round(y),
      ...(viewportCenter
        ? { viewportCenter: { x: Math.round(viewportCenter.x), y: Math.round(viewportCenter.y) } }
        : {})
    };
    const now = Date.now();
    const elapsed = now - this.lastCursorSentAt;

    if (elapsed >= THROTTLE_MS) {
      if (this.cursorTimer !== null) {
        window.clearTimeout(this.cursorTimer);
        this.cursorTimer = null;
      }
      this.pendingCursorPayload = null;
      this.lastCursorSentAt = now;
      this.socket.emit('island:cursor', payload);
      return;
    }

    this.pendingCursorPayload = payload;
    if (this.cursorTimer === null) {
      this.cursorTimer = window.setTimeout(() => {
        this.cursorTimer = null;
        if (this.pendingCursorPayload && this.socket?.connected) {
          this.lastCursorSentAt = Date.now();
          this.socket.emit('island:cursor', this.pendingCursorPayload);
        }
        this.pendingCursorPayload = null;
      }, THROTTLE_MS - elapsed);
    }
  }

  public lockItem(islandId: string, itemId: string | null): void {
    if (!this.socket?.connected) return;
    this.socket.emit('island:item:lock', { islandId, itemId });
  }

  public focusItem(islandId: string, itemId: string | null): void {
    if (!this.socket?.connected) return;
    this.socket.emit('island:item:focus', { islandId, itemId });
  }

  public upsertItem(islandId: string, item: IslandItemUpsertInput): Promise<IslandItem> {
    return this.emitWithAck<{ item?: IslandItem } | IslandItem>('island:item:upsert', {
      islandId,
      item
    }).then((res) => {
      if (res && typeof res === 'object' && 'item' in res && res.item) {
        return res.item;
      }
      return res as IslandItem;
    });
  }

  /**
   * Throttled to 50ms while dragging (`persist` falsy);
   * sends immediately with ack on pointer release (`persist: true`).
   */
  public moveItem(islandId: string, patch: IslandItemMovePatch): Promise<IslandItem | null> {
    if (!this.socket?.connected) {
      return patch.persist ? Promise.reject(new IslandSocketError('协同服务未连接')) : Promise.resolve(null);
    }

    const normalized: IslandItemMovePatch = {
      ...patch,
      x: Math.round(patch.x * 10) / 10,
      y: Math.round(patch.y * 10) / 10,
      ...(patch.w !== undefined ? { w: Math.round(patch.w) } : {}),
      ...(patch.h !== undefined ? { h: Math.round(patch.h) } : {}),
      ...(patch.rotation !== undefined ? { rotation: Math.round(patch.rotation * 10) / 10 } : {})
    };

    if (normalized.persist) {
      const existingTimer = this.moveTimers.get(normalized.itemId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        this.moveTimers.delete(normalized.itemId);
      }
      this.pendingMovePayloads.delete(normalized.itemId);
      this.lastMoveSentAt.set(normalized.itemId, Date.now());

      return this.emitWithAck<{ item?: IslandItem } | IslandItem | null>('island:item:move', {
        islandId,
        ...normalized,
        persist: true
      }).then((res) => {
        if (!res) return null;
        if (typeof res === 'object' && 'item' in res && res.item) return res.item;
        if (typeof res === 'object' && 'id' in res) return res as IslandItem;
        return null;
      });
    }

    const now = Date.now();
    const lastSent = this.lastMoveSentAt.get(normalized.itemId) || 0;
    const elapsed = now - lastSent;

    if (elapsed >= THROTTLE_MS) {
      const existingTimer = this.moveTimers.get(normalized.itemId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        this.moveTimers.delete(normalized.itemId);
      }
      this.pendingMovePayloads.delete(normalized.itemId);
      this.lastMoveSentAt.set(normalized.itemId, now);
      this.socket.emit('island:item:move', { islandId, ...normalized, persist: false });
      return Promise.resolve(null);
    }

    this.pendingMovePayloads.set(normalized.itemId, { islandId, patch: normalized });
    if (!this.moveTimers.has(normalized.itemId)) {
      const timer = window.setTimeout(() => {
        this.moveTimers.delete(normalized.itemId);
        const pending = this.pendingMovePayloads.get(normalized.itemId);
        this.pendingMovePayloads.delete(normalized.itemId);
        if (pending && this.socket?.connected) {
          this.lastMoveSentAt.set(normalized.itemId, Date.now());
          this.socket.emit('island:item:move', {
            islandId: pending.islandId,
            ...pending.patch,
            persist: false
          });
        }
      }, THROTTLE_MS - elapsed);
      this.moveTimers.set(normalized.itemId, timer);
    }

    return Promise.resolve(null);
  }

  public deleteItem(islandId: string, itemId: string): Promise<{ itemId: string }> {
    return this.emitWithAck<{ itemId?: string } | null>('island:item:delete', {
      islandId,
      itemId
    }).then((res) => ({ itemId: res?.itemId || itemId }));
  }

  public onPresence(listener: (users: IslandOnlineUser[]) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (payload: IslandOnlineUser[] | { users?: IslandOnlineUser[]; onlineUsers?: IslandOnlineUser[] }) => {
      if (Array.isArray(payload)) {
        listener(payload);
        return;
      }
      const list = payload?.onlineUsers || payload?.users;
      if (Array.isArray(list)) listener(list);
    };
    socket.on('island:presence', handler);
    return () => socket.off('island:presence', handler);
  }

  public onCursor(listener: (event: IslandCursorEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (
      payload: IslandCursorEvent & { x?: number; y?: number }
    ) => {
      if (!payload?.socketId) return;
      const cursor =
        payload.cursor !== undefined
          ? payload.cursor
          : typeof payload.x === 'number' && typeof payload.y === 'number'
            ? { x: payload.x, y: payload.y }
            : null;
      listener({
        islandId: payload.islandId,
        socketId: payload.socketId,
        publicKey: payload.publicKey,
        cursor,
        viewportCenter: payload.viewportCenter ?? null
      });
    };
    socket.on('island:cursor', handler);
    return () => socket.off('island:cursor', handler);
  }

  public onItemLocked(listener: (event: IslandItemLockedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('island:item:locked', listener);
    return () => socket.off('island:item:locked', listener);
  }

  public onItemUpserted(listener: (item: IslandItem) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (payload: { item?: IslandItem } | IslandItem) => {
      const item = payload && typeof payload === 'object' && 'item' in payload ? payload.item : (payload as IslandItem);
      if (item?.id) listener(item);
    };
    socket.on('island:item:upserted', handler);
    return () => socket.off('island:item:upserted', handler);
  }

  public onItemMoved(listener: (event: IslandItemMovedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (payload: IslandItemMovedEvent & { id?: string; item?: IslandItem }) => {
      if (payload?.item?.id) {
        listener({
          islandId: payload.islandId,
          itemId: payload.item.id,
          x: payload.item.x,
          y: payload.item.y,
          w: payload.item.w,
          h: payload.item.h,
          rotation: payload.item.rotation,
          zIndex: payload.item.zIndex,
          updatedAt: payload.item.updatedAt
        });
        return;
      }
      const itemId = payload?.itemId || payload?.id;
      if (itemId && typeof payload.x === 'number' && typeof payload.y === 'number') {
        listener({ ...payload, itemId });
      }
    };
    socket.on('island:item:moved', handler);
    return () => socket.off('island:item:moved', handler);
  }

  public onItemDeleted(listener: (event: { islandId?: string; itemId: string }) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (payload: { islandId?: string; itemId?: string; id?: string }) => {
      const itemId = payload?.itemId || payload?.id;
      if (itemId) listener({ islandId: payload.islandId, itemId });
    };
    socket.on('island:item:deleted', handler);
    return () => socket.off('island:item:deleted', handler);
  }

  public onIslandUpdated(listener: (patch: Partial<IslandSummary>) => void): Unsubscribe {
    const socket = this.requireSocket();
    const handler = (payload: { island?: Partial<IslandSummary> } | Partial<IslandSummary>) => {
      const patch =
        payload && typeof payload === 'object' && 'island' in payload
          ? payload.island
          : (payload as Partial<IslandSummary>);
      if (patch) listener(patch);
    };
    socket.on('island:updated', handler);
    return () => socket.off('island:updated', handler);
  }

  public onKicked(listener: (event: IslandKickedEvent) => void): Unsubscribe {
    const socket = this.requireSocket();
    socket.on('island:kicked', listener);
    return () => socket.off('island:kicked', listener);
  }

  public onConnectionChange(listener: (connected: boolean) => void): Unsubscribe {
    const socket = this.requireSocket();
    const onConnect = () => listener(true);
    const onDisconnect = () => listener(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }

  private emitWithAck<T>(event: string, payload?: unknown): Promise<T> {
    const socket = this.requireSocket();
    if (!socket.connected) return Promise.reject(new IslandSocketError('浮岛协同服务未连接'));

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new IslandSocketError('请求超时，请重试')), 8000);
      const ack = (response: Ack<T>) => {
        window.clearTimeout(timer);
        if (response?.ok) resolve(response.data);
        else reject(new IslandSocketError(response?.error || '操作失败', response?.code, response?.data));
      };

      if (payload === undefined) socket.emit(event, ack);
      else socket.emit(event, payload, ack);
    });
  }

  private clearThrottleTimers(): void {
    if (this.cursorTimer !== null) {
      window.clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
    this.pendingCursorPayload = null;
    this.moveTimers.forEach((timer) => window.clearTimeout(timer));
    this.moveTimers.clear();
    this.pendingMovePayloads.clear();
  }

  private requireSocket(): Socket {
    if (!this.socket) throw new IslandSocketError('浮岛协同服务尚未初始化');
    return this.socket;
  }
}
