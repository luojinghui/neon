'use client';

import type { CSSProperties } from 'react';
import type { IslandOnlineUser } from '../../core/types';
import styles from '../island-canvas.module.css';

interface PresenceLayerProps {
  onlineUsers: IslandOnlineUser[];
  selfSocketId: string | null;
}

export function PresenceLayer({ onlineUsers, selfSocketId }: PresenceLayerProps) {
  const remoteUsers = onlineUsers.filter(
    (user) => user.socketId !== selfSocketId && user.cursor !== null
  );

  if (!remoteUsers.length) return null;

  return (
    <div className={styles.presenceLayer} aria-hidden="true">
      {remoteUsers.map((user) => {
        if (!user.cursor) return null;
        return (
          <div
            key={user.socketId}
            className={styles.remoteCursor}
            style={
              {
                transform: `translate3d(${user.cursor.x}px, ${user.cursor.y}px, 0)`,
                '--cursor-color': user.color || 'hsl(var(--primary))'
              } as CSSProperties
            }
          >
            <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
              <path
                d="M2.2 1.8L15.8 9.2L9.3 11.1L6.6 17.6L2.2 1.8Z"
                fill={user.color || 'hsl(var(--primary))'}
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <div className={styles.remoteCursorTag}>{user.name || '旅人'}</div>
          </div>
        );
      })}
    </div>
  );
}
