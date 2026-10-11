import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { deadlineLabel } from '../format';
import type { Market } from '../types';
import { LOOK, SLAB } from './scene-tokens';

/**
 * Face text as a texture drawn with the brand fonts already loaded by @windle/tokens/fonts.css (Unbounded for the big
 * odds, Inter Tight for labels). Chosen over troika SDF text: troika 0.52 rejects woff2 (the only format Fontsource
 * ships) and would render the variable fonts at their default instance; canvas text gets the real weights.
 */

const DISPLAY = '"Unbounded Variable", ui-sans-serif, system-ui, sans-serif';
const SANS = '"Inter Tight Variable", ui-sans-serif, system-ui, sans-serif';

export const FACE = {
  width: SLAB.width - SLAB.bevel.size * 2,
  height: SLAB.height - SLAB.bevel.size * 2,
} as const;

export function loadFaceFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load(`700 64px ${DISPLAY}`),
    document.fonts.load(`500 32px ${SANS}`),
    document.fonts.load(`600 32px ${SANS}`),
  ]).catch(() => undefined);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Canvas 2D letterSpacing (Chromium 99+, Safari 18+, Firefox 115+); a no-op where unsupported. */
function track(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

export function drawFace(canvas: HTMLCanvasElement, market: Market, now: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const k = canvas.width / FACE.width;
  const px = (u: number) => Math.round(u * k);
  const pad = SLAB.pad - SLAB.bevel.size;
  const left = px(pad);
  const right = canvas.width - px(pad);
  const top = px(pad - 0.01);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';

  ctx.font = `600 ${px(0.066)}px ${SANS}`;
  track(ctx, px(0.066) * 0.14);
  ctx.fillStyle = LOOK.rim;
  ctx.textAlign = 'left';
  ctx.fillText(`$${market.ticker}`, left, top);
  ctx.font = `500 ${px(0.066)}px ${SANS}`;
  track(ctx, px(0.066) * 0.03);
  ctx.fillStyle = market.status === 'settling' ? LOOK.cyan : LOOK.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(deadlineLabel(market, now), right, top);

  ctx.textAlign = 'left';
  ctx.fillStyle = LOOK.text;
  const big = px(0.3);
  ctx.font = `700 ${big}px ${DISPLAY}`;
  track(ctx, -big * 0.04);
  const pct = String(market.shipProbability);
  const y = top + px(0.14);
  ctx.fillText(pct, left - px(0.008), y);
  const w = ctx.measureText(pct).width;
  ctx.font = `700 ${Math.round(big * 0.5)}px ${DISPLAY}`;
  ctx.fillStyle = LOOK.textMuted;
  ctx.fillText('%', left + w + px(0.012), y + Math.round(big * 0.08));
  ctx.font = `500 ${px(0.056)}px ${SANS}`;
  track(ctx, px(0.056) * 0.06);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  // sits on the big number's baseline (Unbounded cap height ~0.74 em from the top of the em box)
  ctx.fillText('ship odds', right, y + Math.round(big * 0.84));
  ctx.textBaseline = 'top';

  ctx.textAlign = 'left';
  ctx.fillStyle = LOOK.textBody;
  const size = px(0.064);
  ctx.font = `500 ${size}px ${SANS}`;
  track(ctx, 0);
  const lines = wrap(ctx, market.promise, right - left, 2);
  const promiseTop = canvas.height - px(0.355);
  lines.forEach((l, i) => {
    ctx.fillText(l, left, promiseTop + i * Math.round(size * 1.32));
  });
}

/** Texture for one face: sRGB, mipmapped + anisotropic (far slabs stay clean), premultiplied alpha over the metal. */
export function createFaceTexture(
  width: number,
  anisotropy: number,
): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((width * FACE.height) / FACE.width);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.premultiplyAlpha = true;
  return { canvas, texture };
}
