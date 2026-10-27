import { usePref } from '@/features/settings/prefs';
import { useClock } from '@/lib/clock';
import { useServerOffset } from '@/lib/server-time';
import { formatAbsolute, formatAgo, formatPostTime } from '@/lib/time';

type Props = {
  iso: string;
  /** `short` is `12s`, `4m`, `Oct 12`; `ago` is `12s ago`. */
  format?: 'short' | 'ago';
  /** `column` keeps a 3ch width and lines up on the right; `inline` hugs its neighbours. Defaults to `inline` for `ago`. */
  align?: 'column' | 'inline';
  className?: string;
};

const BASE = 'inline-block whitespace-nowrap tabular-nums';
/** `12s` in a column keeps its width and lines up on the right; inline text (`12s ago`, a header) hugs its neighbours. */
const COLUMN = 'min-w-[3ch] text-right';
const INLINE = 'min-w-0 text-left';

function Body({ ms, format, unit }: { ms: number; format: 'short' | 'ago'; unit: 'second' | 'minute' }) {
  const now = useClock(unit) + useServerOffset();
  return <>{format === 'ago' ? formatAgo(ms, now) : formatPostTime(ms, now)}</>;
}

/**
 * A moment shown relative to the server's clock, not this machine's, and ticking on the shared clock: once a second for
 * the first two minutes, once a minute after. The tooltip carries the exact time in the viewer's zone and 12/24h choice.
 */
export function Time({ iso, format = 'short', align, className = '' }: Props) {
  const inline = (align ?? (format === 'ago' ? 'inline' : 'column')) === 'inline';
  const clock = usePref('clock');
  const offset = useServerOffset();
  useClock('minute');
  const ms = Date.parse(iso);
  const young = Date.now() + offset - ms < 120_000;
  if (!Number.isFinite(ms)) return null;
  return (
    <time
      dateTime={iso}
      title={formatAbsolute(ms, clock)}
      className={`${BASE} ${inline ? INLINE : COLUMN} ${className}`}
    >
      <Body ms={ms} format={format} unit={young ? 'second' : 'minute'} />
    </time>
  );
}
