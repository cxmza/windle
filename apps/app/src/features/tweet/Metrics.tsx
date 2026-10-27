import type { XMetrics } from '@windle/shared';
import type { ReactNode } from 'react';
import { formatCompact, formatExact } from '@/lib/format';

const ICONS: Record<keyof XMetrics, ReactNode> = {
  replies: <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />,
  reposts: (
    <path d="M3 6.5V5.5a1.5 1.5 0 0 1 1.5-1.5H12m0 0-2-2m2 2-2 2M13 9.5v1a1.5 1.5 0 0 1-1.5 1.5H4m0 0 2 2m-2-2 2-2" />
  ),
  quotes: <path d="M3 5.5h3.5v3.5H4.5a1.5 1.5 0 0 0 1.5 2M9.5 5.5H13v3.5h-2a1.5 1.5 0 0 0 1.5 2" />,
  likes: <path d="M8 13.2S2.5 10 2.5 6.2A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5.5 1.2C13.5 10 8 13.2 8 13.2z" />,
  bookmarks: <path d="M4.5 2.5h7v11L8 10.8 4.5 13.5z" />,
  views: <path d="M3.5 13V8.5M8 13V3.5M12.5 13V6" />,
};

const NAMES: Record<keyof XMetrics, readonly [string, string]> = {
  replies: ['reply', 'replies'],
  reposts: ['repost', 'reposts'],
  quotes: ['quote', 'quotes'],
  likes: ['like', 'likes'],
  bookmarks: ['bookmark', 'bookmarks'],
  views: ['view', 'views'],
};

const ORDER = ['replies', 'reposts', 'quotes', 'likes', 'bookmarks', 'views'] as const;

export function Metrics({ metrics }: { metrics: XMetrics }) {
  return (
    <ul
      data-metrics
      aria-label="Engagement"
      className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground tabular-nums"
    >
      {ORDER.map((key) => {
        const value = metrics[key];
        if (value === null) return null;
        const [one, many] = NAMES[key];
        const exact = `${formatExact(value)} ${value === 1 ? one : many}`;
        return (
          <li key={key} data-metric={key} title={exact} className="inline-flex items-center gap-1">
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              className="shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[key]}
            </svg>
            <span aria-hidden="true">{formatCompact(value)}</span>
            <span className="sr-only">{exact}</span>
          </li>
        );
      })}
    </ul>
  );
}
