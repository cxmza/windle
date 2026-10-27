import type { MarketSide } from '@windle/shared';

export interface ChartTheme {
  up: string;
  down: string;
  volumeUp: string;
  volumeDown: string;
  volumeBot: string;
  line: Record<MarketSide, string>;
  grid: string;
  text: string;
  crosshair: string;
  crosshairLabel: string;
  fontFamily: string;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

let scratch: CanvasRenderingContext2D | null | undefined;

function canvasContext(): CanvasRenderingContext2D | null {
  if (scratch !== undefined) return scratch;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    scratch = null;
  }
  return scratch;
}

/** Computed colors can be oklch()/color-mix(), which the chart's own parser may not read: flatten to sRGB. */
function toRgba(computed: string): Rgba | null {
  const ctx = canvasContext();
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const px = ctx.getImageData(0, 0, 1, 1).data;
  const [r, g, b, a] = [px[0], px[1], px[2], px[3]];
  if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
  return { r, g, b, a: a / 255 };
}

const rgbaString = ({ r, g, b, a }: Rgba): string => `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;

/** Resolves a CSS color expression (usually `var(--token)`) against `scope` into something the chart can paint. */
export function resolveColor(scope: HTMLElement, expression: string, alpha = 1): string {
  const probe = document.createElement('span');
  probe.style.color = expression;
  probe.style.display = 'none';
  scope.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const rgba = toRgba(computed);
  if (!rgba) return computed;
  return rgbaString({ ...rgba, a: rgba.a * alpha });
}

export function readChartTheme(scope: HTMLElement): ChartTheme {
  const styles = getComputedStyle(scope);
  return {
    up: resolveColor(scope, 'var(--yes)'),
    down: resolveColor(scope, 'var(--no)'),
    volumeUp: resolveColor(scope, 'var(--yes)', 0.55),
    volumeDown: resolveColor(scope, 'var(--no)', 0.55),
    volumeBot: resolveColor(scope, 'var(--muted-foreground)', 0.3),
    line: { yes: resolveColor(scope, 'var(--yes)'), no: resolveColor(scope, 'var(--no)') },
    grid: resolveColor(scope, 'var(--hairline)'),
    text: resolveColor(scope, 'var(--muted-foreground)'),
    crosshair: resolveColor(scope, 'var(--muted-foreground)'),
    crosshairLabel: resolveColor(scope, 'var(--selected)'),
    fontFamily: styles.getPropertyValue('--font-mono').trim() || styles.fontFamily,
  };
}
