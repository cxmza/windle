export function LiveDot({ paused = false }: { paused?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-live-dot
      data-paused={paused || undefined}
      className="relative inline-block size-1.5 shrink-0 rounded-full bg-glow"
    />
  );
}
