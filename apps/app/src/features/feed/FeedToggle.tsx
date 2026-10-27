import { LiveDot } from '@/components/LiveDot';

type Props = { open: boolean; onToggle: () => void; controls: string; paused: boolean };

/** Between the mobile and desktop breakpoints the feed is a drawer; this button in the markets header opens it. */
export function FeedToggle({ open, onToggle, controls, paused }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="hidden h-8 items-center gap-2 rounded-md border border-(--control-border) px-2.5 text-xs font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) aria-expanded:bg-(--selected) active:bg-(--selected) md:inline-flex xl:hidden [@media(hover:hover)]:hover:bg-(--hover)"
    >
      <LiveDot paused={paused} />X feed
    </button>
  );
}
