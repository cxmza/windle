import type { ApiMarket, CandleTimeframe, MarketSide } from '@windle/shared';
import { type ReactNode, useState } from 'react';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { formatSignedPp } from '../format';
import { useCandles } from '../hooks';
import { BOT_HINT } from './bot-copy';
import { CandleChart } from './CandleChart';
import {
  type ChartKind,
  candleAt,
  defaultTimeframe,
  hasTrades,
  marketAgeMs,
  summarize,
  TIMEFRAME_OPTIONS,
} from './candle-model';
import { sideLabel } from './market-view';

const CHART_HEIGHT = 'h-72 md:h-96';

function CandlesIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M5 2v12M11 2v12" strokeLinecap="round" />
      <rect x="3.25" y="5" width="3.5" height="5" rx="0.5" fill="currentColor" />
      <rect x="9.25" y="4" width="3.5" height="6" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2 11l3.5-4 3 2.5L14 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const KIND_OPTIONS = [
  { value: 'candles', label: 'Candles', icon: <CandlesIcon /> },
  { value: 'line', label: 'Line', icon: <LineIcon /> },
] as const satisfies readonly { value: ChartKind; label: string; icon: ReactNode }[];

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className={`flex ${CHART_HEIGHT} w-full flex-col items-center justify-center gap-3 px-4 text-center text-sm`}>
      {children}
    </div>
  );
}

function Legend({ candle }: { candle: ReturnType<typeof summarize> | null }) {
  const tone = !candle || candle.changePp === 0 ? '' : candle.changePp > 0 ? 'text-(--yes)' : 'text-(--no)';
  const cell = (k: string, v: number | undefined) => (
    <span className="inline-flex gap-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={tone}>{v === undefined ? '—' : `${v.toFixed(1)}%`}</span>
    </span>
  );
  return (
    <p data-chart-legend className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
      {cell('O', candle?.open)}
      {cell('H', candle?.high)}
      {cell('L', candle?.low)}
      {cell('C', candle?.close)}
      <span className={tone}>{candle ? formatSignedPp(candle.changePp) : '—'}</span>
    </p>
  );
}

export function MarketChartCard({ market }: { market: ApiMarket }) {
  const live = market.status === 'open';
  const [tf, setTf] = useState<CandleTimeframe>(() => defaultTimeframe(marketAgeMs(market, Date.now())));
  const [side, setSide] = useState<MarketSide>('yes');
  const [kind, setKind] = useState<ChartKind>('candles');
  const [hover, setHover] = useState<number | null>(null);
  const query = useCandles(market.slug, tf, side, live);
  const candles = query.data?.candles ?? [];
  const hovered = candleAt(candles, hover);
  const summary = hovered ? summarize(hovered) : null;
  const quiet = query.data !== undefined && !hasTrades(candles);
  const botTrades = market.stats?.botTrades ?? market.botTradeCount ?? 0;
  const sideOptions = [
    { value: 'yes', label: sideLabel(market, 'yes') },
    { value: 'no', label: sideLabel(market, 'no') },
  ] as const satisfies readonly { value: MarketSide; label: string }[];

  return (
    <section aria-label="Odds chart" data-chart-card className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Timeframe" value={tf} onValueChange={setTf} options={TIMEFRAME_OPTIONS} />
          <SegmentedControl label="Chart type" value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
        </div>
        <SegmentedControl label="Chart side" value={side} onValueChange={setSide} options={sideOptions} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-2">
        <Legend candle={summary} />
        {quiet ? (
          <p data-chart-empty className="text-xs text-muted-foreground">
            No trades yet · odds open at {Math.round((candles[0]?.o ?? market.probYes) * 100)}%
          </p>
        ) : null}
      </div>
      <div className="px-2 md:px-4">
        {query.isPending ? (
          <Placeholder>
            <span role="status" className="sr-only">
              Loading the chart…
            </span>
            <div aria-hidden="true" className="size-full rounded-md bg-muted/40 motion-safe:animate-pulse" />
          </Placeholder>
        ) : query.isError && !query.data ? (
          <Placeholder>
            <p role="alert" className="text-muted-foreground">
              The chart could not load. Odds and trades are unaffected.
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="min-h-8 rounded-md border border-(--control-border) px-3 font-medium transition-colors duration-(--dur-instant) hover:bg-(--hover) active:bg-(--selected)"
            >
              Try again
            </button>
          </Placeholder>
        ) : (
          <CandleChart
            kind={kind}
            side={side}
            tf={tf}
            candles={candles}
            onHover={setHover}
            label={summary ? `Odds chart: ${sideLabel(market, side)} at ${summary.close}%` : 'Odds chart, no data yet'}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs text-muted-foreground">
        <ul aria-label="Chart legend" className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1">
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-(--yes)/55" />
            Volume
          </li>
          {botTrades > 0 ? (
            <li title={BOT_HINT} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-muted-foreground/30" />
              Bot volume
            </li>
          ) : null}
        </ul>
        <a
          href="https://www.tradingview.com/"
          title="TradingView Lightweight Charts™ © 2025 TradingView, Inc."
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm underline decoration-transparent underline-offset-2 transition-colors duration-(--dur-instant) ease-(--ease-standard) [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:decoration-current"
        >
          Charts by TradingView
        </a>
      </div>
    </section>
  );
}
