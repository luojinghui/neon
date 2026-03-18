'use client';

export function ChatRoomCardSkeleton({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: Math.max(0, count) });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
      {items.map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border p-4 bg-surface shadow-sm animate-pulse"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-2/3 rounded bg-background-tertiary" />
            <div className="h-5 w-10 rounded-full bg-background-tertiary" />
          </div>
          <div className="mt-3 h-3 w-1/2 rounded bg-background-tertiary" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-background-tertiary" />
            <div className="h-3 w-4/5 rounded bg-background-tertiary" />
          </div>
          <div className="mt-4 h-7 w-16 rounded-md bg-background-tertiary" />
        </div>
      ))}
    </div>
  );
}

