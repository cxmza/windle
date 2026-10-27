import type { Market } from '@windle/shared';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { LiveDot } from '@/components/LiveDot';
import { usePref } from '@/features/settings/prefs';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { useReducedMotion } from '@/lib/media';
import { cssDuration, cssEasing } from '@/lib/motion';
import { useMarkets } from '../predict/hooks';
import { classifyTweet } from './classify';
import { FeedRow } from './FeedRow';
import { FeedSkeleton } from './FeedSkeleton';
import { plural } from './format';
import { type FeedTweet, sourceId } from './types';
import { anchoredScrollTop, type FeedCadence, useFeedBuffer, useThrottledCount } from './use-feed-buffer';
import type { TweetFeed } from './use-tweet-feed';

export type FeedMode = 'column' | 'overlay' | 'page';
type Filter = 'crypto' | 'all' | 'promises' | 'market';

const FILTERS = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'all', label: 'All' },
  { value: 'promises', label: 'Promises' },
  { value: 'market', label: 'Markets' },
] as const satisfies readonly { value: Filter; label: string }[];

const AWAY_PX = 8;
const ANNOUNCE_EVERY_MS = 8000;
const MAX_OPENING = 6;
const EAGER_ROWS = 8;
const WATCH_ROWS = 12;
const CADENCE: FeedCadence = { everyMs: 1500, maxRows: 3 };

/** Posts the relay tagged as crypto, or a promise by the text heuristic; a payload without `signals` was gated already. */
const isCrypto = (t: FeedTweet): boolean => {
  const signals = t.feed?.signals;
  return signals === undefined || signals.length > 0 || classifyTweet(t.text) === 'promise';
};

const SHELL: Record<FeedMode, string> = {
  column:
    'sticky top-0 h-[calc(100dvh-env(safe-area-inset-bottom,0px))] w-90 shrink-0 self-start border-r border-(--hairline)',
  overlay:
    'fixed top-0 bottom-0 left-(--sidebar-w) z-(--z-header) w-90 max-w-[calc(100vw-var(--sidebar-w))] border-r border-(--hairline)',
  page: 'relative h-[calc(100dvh-var(--menu-clearance)-4.5rem-env(safe-area-inset-bottom,0px))] w-full',
};

const iconButton =
  "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-(--control-border) text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) disabled:cursor-not-allowed disabled:opacity-50 active:enabled:bg-(--selected) [@media(hover:hover)]:enabled:hover:bg-(--hover) [@media(hover:hover)]:enabled:hover:text-foreground max-md:before:absolute max-md:before:-inset-2 max-md:before:content-['']";

function focusIsVisible(e: FocusEvent<HTMLElement>): boolean {
  try {
    return e.target.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** Fractional height of the list's content; scrollHeight rounds, which shows as sub-pixel drift when rows are fractional. */
function contentHeight(el: HTMLElement): number {
  const first = el.firstElementChild;
  const last = el.lastElementChild;
  if (!first || !last) return el.scrollHeight;
  const h = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
  return h > 0 ? h : el.scrollHeight;
}

interface RowAnchor {
  id: string;
  top: number;
}

/** The first row that still shows under the top edge, and where it sits; used to undo height changes above it. */
function readRowAnchor(scroller: HTMLElement): RowAnchor | null {
  const edge = scroller.getBoundingClientRect().top;
  for (const item of scroller.children) {
    const id = item.firstElementChild?.getAttribute('data-tweet-id');
    const rect = item.getBoundingClientRect();
    if (id && rect.bottom > edge + 1) return { id, top: rect.top - edge };
  }
  return null;
}

function rowTop(scroller: HTMLElement, id: string): number | null {
  for (const item of scroller.children) {
    if (item.firstElementChild?.getAttribute('data-tweet-id') === id) {
      return item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }
  }
  return null;
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z" />}
    </svg>
  );
}

interface RowHeights {
  width: number;
  byId: Map<string, number>;
}

function readHeights(scroller: HTMLElement): RowHeights {
  const byId = new Map<string, number>();
  let n = 0;
  for (const item of scroller.children) {
    if (n++ >= WATCH_ROWS) break;
    const id = item.firstElementChild?.getAttribute('data-tweet-id');
    if (id && !item.querySelector('[data-feed-details]')) byId.set(id, item.getBoundingClientRect().height);
  }
  return { width: scroller.clientWidth, byId };
}

function motionTiming(calm: boolean) {
  return {
    duration: cssDuration(calm ? '--dur-fast' : '--dur-base', calm ? 180 : 260),
    easing: calm ? 'linear' : cssEasing('--ease-decelerate', 'cubic-bezier(0.05, 0.7, 0.1, 1)'),
  };
}

function track(item: HTMLElement, anims: Animation[], running: Set<Animation>) {
  for (const a of anims) running.add(a);
  const done = () => {
    for (const a of anims) running.delete(a);
    delete item.dataset.opening;
  };
  Promise.all(anims.map((a) => a.finished)).then(done, done);
}

/**
 * Rows that arrived at the very top grow from zero height and fade in; the rows under them slide down with the
 * growth. In calm mode (the setting, or reduced motion) they only fade. Height is measured, so the end state is the
 * row's natural size. A batch of rows shares one duration and curve, so together they are a single growth.

 * TODO(motion): reveal through a transform (FLIP) so an arriving batch is one layout shift instead of ~15 per batch.
 */
function openRows(items: readonly HTMLElement[], calm: boolean, running: Set<Animation>) {
  const timing = motionTiming(calm);
  for (const item of items) {
    const row = item.firstElementChild;
    if (typeof item.animate !== 'function' || !(row instanceof HTMLElement)) continue;
    const anims = [row.animate([{ opacity: 0 }, { opacity: 1 }], timing)];
    if (!calm) {
      item.dataset.opening = '';
      anims.push(item.animate([{ height: '0px' }, { height: `${item.getBoundingClientRect().height}px` }], timing));
    }
    track(item, anims, running);
  }
}

/**
 * A row that is already on screen at the top and changed height (a second copy of the post added a line): the rows
 * under it follow over the same duration instead of jumping. Calm mode and unchanged rows are left alone, and so are
 * rows with their details open or closing: those ease their own height (FeedDetails), and replaying that here would
 * play the same growth twice.
 */
function easeGrownRows(scroller: HTMLElement, before: RowHeights, running: Set<Animation>) {
  if (before.width !== scroller.clientWidth) return;
  const timing = motionTiming(false);
  let n = 0;
  for (const item of scroller.children) {
    if (n++ >= WATCH_ROWS) break;
    const id = item.firstElementChild?.getAttribute('data-tweet-id');
    const was = id ? before.byId.get(id) : undefined;
    if (!(item instanceof HTMLElement) || was === undefined || item.dataset.opening !== undefined) continue;
    if (item.querySelector('[data-feed-details]')) continue;
    const now = item.getBoundingClientRect().height;
    if (Math.abs(now - was) <= 1 || typeof item.animate !== 'function') continue;
    item.dataset.opening = '';
    track(item, [item.animate([{ height: `${was}px` }, { height: `${now}px` }], timing)], running);
  }
}

const STATUS_LABELS = ['Live', 'Paused', 'Syncing', 'Sample', 'Offline', 'Connecting'] as const;
type StatusLabel = (typeof STATUS_LABELS)[number];

type Props = {
  feed: TweetFeed;
  mode: FeedMode;
  id: string;
  onClose?: () => void;
  /** The drawer is on its way out: hidden from assistive tech and input while it slides away. */
  closing?: boolean;
  onClosed?: () => void;
};

export function FeedColumn({ feed, mode, id, onClose, closing = false, onClosed }: Props) {
  const { markets } = useMarkets({ status: 'all', sort: 'new' });
  const reduced = useReducedMotion();
  const calmPref = usePref('feedMotion') === 'calm';
  const calm = reduced || calmPref;
  const [filter, setFilter] = useState<Filter>('crypto');
  const [away, setAway] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const wantTop = useRef(false);
  const anchor = useRef<{ head: string | undefined; height: number; filter: Filter }>({
    head: undefined,
    height: 0,
    filter: 'crypto',
  });
  const heights = useRef<RowHeights | null>(null);
  const opening = useRef(new Set<Animation>());
  const rowAnchor = useRef<RowAnchor | null>(null);

  const byTweet = new Map<string, Market>();
  for (const m of markets) if (m.source) byTweet.set(m.source.id, m);
  const marketOf = (t: FeedTweet): Market | undefined => {
    const id = sourceId(t);
    return id === null ? undefined : byTweet.get(id);
  };

  const matching = feed.tweets.filter((t) =>
    filter === 'promises'
      ? classifyTweet(t.text) === 'promise'
      : filter === 'market'
        ? marketOf(t) !== undefined
        : filter === 'crypto'
          ? isCrypto(t)
          : true,
  );
  const { shown, pending, reveal } = useFeedBuffer(matching, away || hovered || focused, CADENCE, filter);
  const announced = useThrottledCount(pending, ANNOUNCE_EVERY_MS);

  const atRest = !(away || hovered || focused);
  const { settle } = feed;
  useEffect(() => {
    settle?.(atRest);
  }, [settle, atRest]);

  const toTop = (el: HTMLElement) => {
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    else el.scrollTop = 0;
  };

  const head = shown[0]?.id;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const before = anchor.current;
    if (before.head !== undefined && head !== before.head) {
      el.scrollTop = anchoredScrollTop(el.scrollTop, before.height, contentHeight(el));
      const added = shown.findIndex((t) => t.id === before.head);
      if (el.scrollTop === 0 && before.filter === filter && added > 0 && added <= MAX_OPENING) {
        const items = [...el.children].slice(0, added).filter((c): c is HTMLElement => c instanceof HTMLElement);
        openRows(items, calm, opening.current);
      }
      setBusy(true);
    } else if (el.scrollTop > 0 && rowAnchor.current && before.filter === filter) {
      const now = rowTop(el, rowAnchor.current.id);
      if (now !== null && Math.abs(now - rowAnchor.current.top) > 0.5) el.scrollTop += now - rowAnchor.current.top;
    } else if (el.scrollTop === 0 && heights.current && !calm && before.filter === filter) {
      easeGrownRows(el, heights.current, opening.current);
    }
    heights.current = readHeights(el);
    anchor.current = { head, height: contentHeight(el), filter };
    rowAnchor.current = el.scrollTop > 0 ? readRowAnchor(el) : null;
    if (wantTop.current) {
      wantTop.current = false;
      toTop(el);
    }
  });

  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 250);
    return () => window.clearTimeout(t);
  }, [busy]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (opening.current.size > 0) {
      const grown = contentHeight(el);
      for (const a of [...opening.current]) a.finish();
      if (el.scrollTop > 0) el.scrollTop += contentHeight(el) - grown;
    }
    const next = el.scrollTop > AWAY_PX;
    anchor.current = { ...anchor.current, height: contentHeight(el) };
    rowAnchor.current = el.scrollTop > 0 ? readRowAnchor(el) : null;
    setAway(next);
    if (!next && pending > 0) reveal();
  };

  const onReveal = (e: MouseEvent<HTMLButtonElement>) => {
    const byKeyboard = e.detail === 0;
    wantTop.current = true;
    reveal();
    if (byKeyboard) scroller.current?.focus({ preventScroll: true });
    else e.currentTarget.blur();
  };

  const onFilter = (next: Filter) => {
    if (scroller.current) scroller.current.scrollTop = 0;
    setFilter(next);
  };

  const onPointerEnter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') setHovered(true);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && onClose) onClose();
  };

  const skipFeed = () => {
    document.querySelector<HTMLElement>('[data-market-row] [data-row-link]')?.focus();
    if (onClose) onClose();
  };

  const conn = feed.connection;
  const sample = feed.kind === 'sample';
  const down = !sample && conn !== undefined && conn.status !== 'live';
  const unavailable = down && !conn.everLive && conn.failures > 0;
  const connecting = down && !conn.everLive && conn.failures === 0;
  const statusLabel: StatusLabel = feed.paused
    ? 'Paused'
    : sample
      ? 'Sample'
      : unavailable
        ? 'Offline'
        : connecting
          ? 'Connecting'
          : down
            ? 'Syncing'
            : 'Live';
  const waiting = !sample && feed.tweets.length === 0;
  const waitingText = unavailable
    ? 'X feed unavailable · retrying'
    : down
      ? conn.everLive
        ? 'Reconnecting to the X stream…'
        : 'Connecting to the X stream…'
      : 'Waiting for posts…';

  return (
    <section
      id={id}
      aria-label="X feed"
      data-feed
      data-mode={mode}
      data-sidebar-offset={mode === 'overlay' ? '' : undefined}
      data-state={closing ? 'closed' : undefined}
      aria-hidden={closing || undefined}
      inert={closing}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClosed?.();
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => setFocused(focusIsVisible(e))}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={`flex min-h-0 flex-col bg-background ${SHELL[mode]}`}
    >
      {mode !== 'page' ? (
        <button
          type="button"
          onClick={skipFeed}
          className="absolute top-1.5 left-2 z-20 inline-flex h-7 items-center rounded-md border border-(--control-border) bg-background px-2.5 text-xs font-medium text-foreground not-focus-visible:sr-only focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Skip feed
        </button>
      ) : null}

      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--hairline) pr-2 pl-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          <LiveDot paused={feed.paused || down || sample} tone={sample && !feed.paused ? 'sample' : 'live'} />
          <span data-feed-status className="grid">
            {STATUS_LABELS.map((label) => (
              <span
                key={label}
                data-label
                aria-hidden={label !== statusLabel || undefined}
                className="col-start-1 row-start-1"
              >
                {label}
              </span>
            ))}
          </span>
        </span>
        <h2 className="text-[0.8125rem] font-semibold text-foreground">X feed</h2>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={feed.toggle}
          disabled={feed.liveOff}
          aria-label={feed.paused ? 'Resume the feed' : 'Pause the feed'}
          title={feed.liveOff ? 'Live feed is off in Settings' : feed.paused ? 'Resume' : 'Pause'}
          className={iconButton}
        >
          <PauseIcon paused={feed.paused} />
        </button>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Hide the feed" className={`${iconButton} max-md:ml-2`}>
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </header>

      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-(--hairline) px-3">
        <SegmentedControl<Filter> label="Filter the feed" value={filter} onValueChange={onFilter} options={FILTERS} />
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {plural(shown.length, 'post')}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div role="status" aria-live="polite" className="sr-only">
          {announced > 0 ? plural(announced, 'new post') : ''}
        </div>

        {pending > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex h-7 justify-center">
            <button
              type="button"
              data-feed-pill
              onClick={onReveal}
              className="pointer-events-auto inline-flex h-7 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground transition-[background-color] duration-(--dur-instant) ease-(--ease-standard) active:brightness-90 [@media(hover:hover)]:hover:bg-accent-hover"
            >
              {plural(pending, 'new post')}
              <span aria-hidden="true" className="ml-1.5">
                ↑
              </span>
            </button>
          </div>
        ) : null}

        <div
          ref={scroller}
          role="feed"
          aria-busy={busy}
          aria-label="Posts from X"
          tabIndex={-1}
          data-feed-scroll
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain outline-none"
        >
          {shown.length === 0 && waiting ? (
            <FeedSkeleton message={waitingText} />
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-3 py-6 text-[0.8125rem] text-muted-foreground">
              <p>
                {filter === 'promises'
                  ? 'No promises in the feed yet.'
                  : filter === 'market'
                    ? 'No posts with a market yet.'
                    : filter === 'crypto'
                      ? 'No crypto posts yet.'
                      : 'No posts yet.'}
              </p>
              {filter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className="inline-flex h-7 items-center rounded-md border border-(--control-border) px-2.5 text-xs font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)"
                >
                  Show all posts
                </button>
              ) : null}
            </div>
          ) : (
            shown.map((t, i) => (
              <div key={t.id} data-feed-item>
                <FeedRow tweet={t} market={marketOf(t)} eager={i < EAGER_ROWS} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
