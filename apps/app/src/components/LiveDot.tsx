export function LiveDot({ paused = false, tone = 'live' }: { paused?: boolean; tone?: 'live' | 'sample' }) {
  return (
    <span
      aria-hidden="true"
      data-live-dot
      data-paused={paused || undefined}
      data-tone={tone === 'live' ? undefined : tone}
      className="relative inline-block size-1.5 shrink-0 rounded-full bg-(--yes)"
    />
  );
}
