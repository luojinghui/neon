'use client';

import { Card } from '@/components/ui/card';
import styles from './SoulLanding.module.css';

export function ChatRoomCardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: Math.max(0, count) }, (_, index) => (
        <Card key={index} padding="md" bodyWrap={false} className={styles.roomCard} aria-hidden="true">
          <div className={styles.decoration} />
          <div className="h-5 w-2/3 animate-pulse rounded-sm bg-surface-active" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full animate-pulse rounded-sm bg-surface-active" />
            <div className="h-3 w-3/4 animate-pulse rounded-sm bg-surface-active" />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-4 w-12 animate-pulse rounded-sm bg-surface-active" />
            <div className="h-4 w-12 animate-pulse rounded-sm bg-surface-active" />
          </div>
          <div className="mt-auto flex justify-between pt-3">
            <div className="h-3 w-12 animate-pulse rounded-sm bg-surface-active" />
            <div className="h-3 w-12 animate-pulse rounded-sm bg-surface-active" />
          </div>
        </Card>
      ))}
    </div>
  );
}
