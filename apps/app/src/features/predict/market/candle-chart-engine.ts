import type { CandleTimeframe, MarketSide } from '@windle/shared';
import {
  type AutoscaleInfo,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  LineStyle,
  TickMarkType,
  type Time,
} from 'lightweight-charts';
import type { ClockFormat } from '@/features/settings/prefs';
import { type CandlePoint, type ChartKind, type LinePoint, paddedRange, type VolumeBar } from './candle-model';
import type { ChartTheme } from './chart-theme';
import { createTickFormatter, formatCrosshairTime, type TickKind } from './chart-ticks';

export interface CandleChartInput {
  kind: ChartKind;
  side: MarketSide;
  tf: CandleTimeframe;
  candles: readonly CandlePoint[];
  line: readonly LinePoint[];
  volume: { total: readonly VolumeBar[]; human: readonly VolumeBar[] };
  theme: ChartTheme;
  clock: ClockFormat;
}

export interface CandleChartEngine {
  render(input: CandleChartInput): void;
  destroy(): void;
}

const TICK_KIND: Record<TickMarkType, TickKind> = {
  [TickMarkType.Year]: 'year',
  [TickMarkType.Month]: 'month',
  [TickMarkType.DayOfMonth]: 'day',
  [TickMarkType.Time]: 'time',
  [TickMarkType.TimeWithSeconds]: 'time',
};

const toSeconds = (time: Time): number => (typeof time === 'number' ? time : 0);

const VOLUME_TOP_MARGIN = 0.8;

type Provider = () => AutoscaleInfo | null;

const padded = (original: Provider): AutoscaleInfo | null => {
  const info = original();
  if (!info?.priceRange) return info;
  const { min, max } = paddedRange(info.priceRange.minValue, info.priceRange.maxValue);
  return { ...info, priceRange: { minValue: min, maxValue: max } };
};

const fromZero = (original: Provider): AutoscaleInfo | null => {
  const max = original()?.priceRange?.maxValue ?? 0;
  return { priceRange: { minValue: 0, maxValue: Math.max(max, 1) } };
};

export function createCandleChart(el: HTMLElement, onHover: (time: number | null) => void): CandleChartEngine {
  const chart: IChartApi = createChart(el, {
    autoSize: true,
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: { time: true, price: false } },
    layout: { attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { visible: true } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
    timeScale: {
      borderVisible: false,
      rightOffset: 2,
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      horzLine: { style: LineStyle.Dashed, width: 1 },
      vertLine: { style: LineStyle.Dashed, width: 1 },
    },
  });

  const lastPrice = { lastValueVisible: true, priceLineVisible: true, priceLineStyle: LineStyle.Dashed } as const;

  const candleSeries: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
    ...lastPrice,
    borderVisible: false,
    autoscaleInfoProvider: padded,
  });
  const lineSeries: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {
    ...lastPrice,
    lineWidth: 2,
    crosshairMarkerRadius: 4,
    autoscaleInfoProvider: padded,
  });

  const volumeOptions = {
    priceScaleId: '',
    priceFormat: { type: 'volume' } as const,
    lastValueVisible: false,
    priceLineVisible: false,
    autoscaleInfoProvider: fromZero,
  };
  const volumeTotal: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, volumeOptions);
  const volumeHuman: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, volumeOptions);
  chart.priceScale('').applyOptions({ scaleMargins: { top: VOLUME_TOP_MARGIN, bottom: 0 } });

  chart.subscribeCrosshairMove((param) => {
    onHover(param.point && param.time !== undefined ? toSeconds(param.time) : null);
  });

  let drawn = '';
  let frame = '';

  return {
    render({ kind, side, tf, candles, line, volume, theme, clock }) {
      const tick = createTickFormatter(tf, clock);
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: theme.text,
          fontFamily: theme.fontFamily,
          fontSize: 11,
        },
        grid: { horzLines: { color: theme.grid } },
        crosshair: {
          vertLine: { color: theme.crosshair, labelBackgroundColor: theme.crosshairLabel },
          horzLine: { color: theme.crosshair, labelBackgroundColor: theme.crosshairLabel },
        },
        localization: {
          priceFormatter: (price: number) => `${Math.round(price * 10) / 10}%`,
          timeFormatter: (time: Time) => formatCrosshairTime(toSeconds(time), tf, clock),
        },
        timeScale: { tickMarkFormatter: (time: Time, type: TickMarkType) => tick(toSeconds(time), TICK_KIND[type]) },
      });
      candleSeries.applyOptions({
        visible: kind === 'candles',
        upColor: theme.up,
        downColor: theme.down,
        wickUpColor: theme.up,
        wickDownColor: theme.down,
      });
      lineSeries.applyOptions({
        visible: kind === 'line',
        color: theme.line[side],
        priceLineColor: theme.line[side],
      });

      const tone = { up: theme.volumeUp, down: theme.volumeDown, bot: theme.volumeBot };
      const signature = [
        side,
        tf,
        theme.up,
        theme.down,
        candles.map((c) => `${c.time}:${c.open}:${c.high}:${c.low}:${c.close}`).join(','),
        volume.total.map((v) => v.value).join(','),
        volume.human.map((v) => `${v.value}${v.tone}`).join(','),
      ].join('|');
      if (signature === drawn) return;
      drawn = signature;
      candleSeries.setData(candles.map((c) => ({ ...c, time: c.time as Time })));
      lineSeries.setData(line.map((p) => ({ time: p.time as Time, value: p.value })));
      volumeTotal.setData(volume.total.map((v) => ({ time: v.time as Time, value: v.value, color: tone[v.tone] })));
      volumeHuman.setData(volume.human.map((v) => ({ time: v.time as Time, value: v.value, color: tone[v.tone] })));
      if (frame !== `${side}|${tf}`) {
        frame = `${side}|${tf}`;
        chart.timeScale().fitContent();
      }
    },
    destroy() {
      chart.remove();
    },
  };
}
