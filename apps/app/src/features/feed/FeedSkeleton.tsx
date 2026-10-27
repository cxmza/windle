const ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

function SkeletonRow() {
  return (
    <div className="flex gap-2.5 border-b border-(--hairline) px-3 py-2.5 [[data-density=compact]_&]:py-1.5">
      <span className="size-8 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3 w-2/5 rounded-sm bg-muted motion-safe:animate-pulse" />
        <span className="h-3 w-full rounded-sm bg-muted motion-safe:animate-pulse" />
        <span className="h-3 w-3/5 rounded-sm bg-muted motion-safe:animate-pulse" />
        <span className="mt-0.5 h-6" />
      </div>
    </div>
  );
}

/** Placeholder rows shaped like posts, with one line saying why they are not posts yet. */
export function FeedSkeleton({ message }: { message: string }) {
  return (
    <div data-feed-skeleton>
      <p role="status" className="px-3 pt-3 pb-1 text-[0.8125rem] text-muted-foreground">
        {message}
      </p>
      <div aria-hidden="true">
        {ROWS.map((k) => (
          <SkeletonRow key={k} />
        ))}
      </div>
    </div>
  );
}
