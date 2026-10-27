import { type CSSProperties, type KeyboardEvent, useRef } from 'react';
import { LiveDot } from '@/components/LiveDot';

export type HomeTab = 'markets' | 'feed';

export const TAB_IDS: Record<HomeTab, { tab: string; panel: string }> = {
  markets: { tab: 'home-tab-markets', panel: 'home-panel-markets' },
  feed: { tab: 'home-tab-feed', panel: 'home-panel-feed' },
};

const ORDER: readonly HomeTab[] = ['markets', 'feed'];

const tab =
  'relative -mb-px inline-flex h-10 flex-1 pb-0.5 items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) aria-selected:text-foreground active:bg-(--selected) [@media(hover:hover)]:hover:text-foreground';

type Props = { value: HomeTab; onValueChange: (tab: HomeTab) => void; livePaused: boolean };

/** Under 48rem the home shows one pane at a time; the feed is a sibling pane, not a drawer over the list. */
export function MobileTabs({ value, onValueChange, livePaused }: Props) {
  const refs = useRef<Record<HomeTab, HTMLButtonElement | null>>({ markets: null, feed: null });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ORDER.indexOf(value);
    const next =
      e.key === 'ArrowRight'
        ? ORDER[(i + 1) % ORDER.length]
        : e.key === 'ArrowLeft'
          ? ORDER[(i + ORDER.length - 1) % ORDER.length]
          : e.key === 'Home'
            ? ORDER[0]
            : e.key === 'End'
              ? ORDER[ORDER.length - 1]
              : undefined;
    if (!next) return;
    e.preventDefault();
    onValueChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Home sections"
      onKeyDown={onKeyDown}
      className="relative flex shrink-0 border-b border-(--hairline) px-4"
    >
      {ORDER.map((t) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[t] = el;
          }}
          type="button"
          role="tab"
          id={TAB_IDS[t].tab}
          aria-selected={value === t}
          aria-controls={TAB_IDS[t].panel}
          tabIndex={value === t ? 0 : -1}
          onClick={() => onValueChange(t)}
          className={tab}
        >
          {t === 'feed' ? <LiveDot paused={livePaused} /> : null}
          {t === 'markets' ? 'Markets' : 'Feed'}
        </button>
      ))}
      <span
        aria-hidden="true"
        data-tab-indicator
        style={{ '--tab-count': ORDER.length, '--tab-index': ORDER.indexOf(value) } as CSSProperties}
        className="pointer-events-none absolute -bottom-px left-4 h-0.5 w-[calc((100%-2rem)/var(--tab-count))] bg-border-accent"
      />
    </div>
  );
}
