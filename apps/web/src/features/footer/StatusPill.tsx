import { cn } from '@/lib/cn';
import type { ApiHealth } from './use-api-health';

const TEXT = {
  ok: 'All systems operational',
  down: 'API unreachable',
  checking: 'Checking status...',
} as const;

/**
 * Live system status, one line: dot + message (truncates before it wraps) + latency in muted tabular numbers.
 * `role="status"` (polite): a change is announced once; the pulse is decoration only and is dropped under
 * prefers-reduced-motion (motion-safe).
 */
export function StatusPill({ health, className }: { health: ApiHealth; className?: string }) {
  return (
    <p
      role="status"
      data-api-status={health.status}
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border/60 px-3 text-[0.8125rem] font-medium whitespace-nowrap text-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
        {health.status === 'ok' && (
          <span className="absolute inset-0 rounded-full bg-accent-text opacity-60 motion-safe:animate-ping" />
        )}
        <span
          className={cn(
            'relative size-2 rounded-full',
            health.status === 'ok' && 'bg-accent-text',
            health.status === 'down' && 'border-2 border-muted-foreground',
            health.status === 'checking' && 'bg-muted-foreground',
          )}
        />
      </span>
      <span className="min-w-0 truncate">{TEXT[health.status]}</span>
      {health.status === 'ok' && (
        <span className="shrink-0 font-normal tabular-nums text-muted-foreground">
          <span aria-hidden="true">· </span>
          {health.latencyMs} ms
        </span>
      )}
    </p>
  );
}
