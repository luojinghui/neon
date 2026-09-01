'use client';

export function ChatRoomCardSkeleton({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: Math.max(0, count) });

  return (
    <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
      {items.map((_, idx) => (
        <div
          key={idx}
          // 注意：loading 阶段只让内部骨架闪烁，避免“边框/背景一起闪烁”
          className="flex min-h-[166px] flex-col rounded-xl border border-border bg-surface p-4 shadow-sm"
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
          <div className="mt-auto h-px w-full bg-background-tertiary" />
          <div className="mt-3 flex justify-between">
            <div className="h-3 w-10 animate-pulse rounded bg-background-tertiary" />
            <div className="h-3 w-10 animate-pulse rounded bg-background-tertiary" />
          </div>
        </div>
      ))}
    </div>
  );
}
