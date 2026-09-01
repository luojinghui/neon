'use client';

export function ChatRoomCardSkeleton({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: Math.max(0, count) });

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((_, idx) => (
        <div
          key={idx}
          // 注意：loading 阶段只让内部骨架闪烁，避免“边框/背景一起闪烁”
          className="flex min-h-[250px] flex-col rounded-lg border border-border bg-surface p-4 shadow-sm backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-2/3 rounded bg-background-tertiary animate-pulse" />
            <div className="h-5 w-10 rounded-lg bg-background-tertiary animate-pulse" />
          </div>
          <div className="mt-3 h-3 w-1/2 rounded bg-background-tertiary animate-pulse" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-background-tertiary animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-background-tertiary animate-pulse" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-5 w-12 animate-pulse rounded-lg bg-background-tertiary" />
            <div className="h-5 w-12 animate-pulse rounded-lg bg-background-tertiary" />
          </div>
          <div className="mt-auto h-8 w-full animate-pulse rounded-lg bg-background-tertiary" />
        </div>
      ))}
    </div>
  );
}
