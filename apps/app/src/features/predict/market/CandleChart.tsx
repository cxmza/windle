import type { Candle, CandleTimeframe, MarketSide } from '@windle/shared';
import { useEffect, useRef, useState } from 'react';
import { usePref } from '@/features/settings/prefs';
import type { CandleChartEngine } from './candle-chart-engine';
import { type ChartKind, toCandleData, toLineData, toVolumeData } from './candle-model';
import { type ChartTheme, readChartTheme } from './chart-theme';

type Props = {
  kind: ChartKind;
  side: MarketSide;
  tf: CandleTimeframe;
  candles: readonly Candle[];
  label: string;
  onHover: (time: number | null) => void;
};

/** Hosts the lazily loaded chart engine: loads it once, keeps it themed, feeds it candles, tears it down. */
export function CandleChart({ kind, side, tf, candles, label, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<CandleChartEngine | null>(null);
  const [failed, setFailed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  const clock = usePref('clock');
  const drawn = useRef<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let created: CandleChartEngine | null = null;
    import('./candle-chart-engine').then(
      ({ createCandleChart }) => {
        if (cancelled) return;
        created = createCandleChart(el, onHover);
        setEngine(created);
      },
      () => {
        if (!cancelled) setFailed(attempt + 1);
      },
    );
    return () => {
      cancelled = true;
      created?.destroy();
      setEngine(null);
    };
  }, [attempt, onHover]);

  useEffect(() => {
    const el = host.current;
    if (!engine || !el) return;
    const read = () => setTheme(readChartTheme(el));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-contrast', 'data-font'],
    });
    return () => observer.disconnect();
  }, [engine]);

  useEffect(() => {
    if (!engine || !theme) return;
    engine.render({
      kind,
      side,
      tf,
      candles: toCandleData(candles),
      line: toLineData(candles),
      volume: toVolumeData(candles),
      theme,
      clock,
    });
    const el = host.current;
    const view = `${tf}|${side}|${kind}`;
    if (el && drawn.current !== null && drawn.current !== view) {
      el.dataset.redraw = el.dataset.redraw === 'a' ? 'b' : 'a';
    }
    drawn.current = view;
  }, [engine, theme, kind, side, tf, candles, clock]);

  const hasFailed = failed > attempt;

  return (
    <div className="relative">
      <div ref={host} role="img" aria-label={label} data-odds-chart className="h-72 w-full md:h-96" />
      {!engine && !hasFailed ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-md bg-muted/40 motion-safe:animate-pulse"
          data-chart-skeleton
        />
      ) : null}
      {hasFailed ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm">
          <p className="text-muted-foreground">The chart could not load. Odds and trades are unaffected.</p>
          <button
            type="button"
            onClick={() => setAttempt(failed)}
            className="min-h-8 rounded-md border border-(--control-border) px-3 font-medium transition-colors duration-(--dur-instant) hover:bg-(--hover) active:bg-(--selected)"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
