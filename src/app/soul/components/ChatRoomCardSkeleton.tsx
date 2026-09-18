'use client';

export function ChatRoomCardSkeleton({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: Math.max(0, count) });

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((_, idx) => (
        <div
          key={idx}
          // 与内容列表保持相同的留白，仅让文字骨架闪烁。
          className="flex min-h-[180px] flex-col rounded-2xl border border-border bg-surface p-5"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-5 w-2/5 animate-pulse rounded bg-background-tertiary" />
            <div className="h-5 w-5 animate-pulse rounded-full bg-background-tertiary" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-background-tertiary animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-background-tertiary animate-pulse" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <div className="h-5 w-12 animate-pulse rounded-md bg-background-tertiary" />
            <div className="h-5 w-12 animate-pulse rounded-md bg-background-tertiary" />
          </div>
          <div className="mt-auto flex justify-between pt-5">
            <div className="h-3 w-10 animate-pulse rounded bg-background-tertiary" />
            <div className="h-3 w-10 animate-pulse rounded bg-background-tertiary" />
          </div>
        </div>
      ))}
    </div>
  );
}
