/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLUE, LOGO_COLOR, NEUTRAL, PALETTE_CSS_VARS, SCENE_BLUE } from './palette';

// read from disk: Vitest's CSS pipeline returns an empty string for `?raw` css imports
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** OKLCH -> sRGB hex (Bjorn Ottosson's matrices), clamped to the gamut. */
function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toHex = (rgb: readonly number[]) =>
  `#${rgb
    .map((v) =>
      Math.round(encode(clamp01(v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

function luminance(rgb: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map(clamp01);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const x = luminance(a) + 0.05;
  const y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

function token(name: string): [number, number, number] {
  const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(tokensCss);
  if (!m) throw new Error(`token --${name} not found as a plain oklch() value`);
  return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

const BLACK = token('gray-0');
const WHITE = token('gray-900');
const MUTED_FG = token('gray-600');
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

describe('palette.ts mirrors tokens.css', () => {
  for (const step of STEPS) {
    it(`--blue-${step} matches BLUE[${step}]`, () => {
      expect(toHex(token(`blue-${step}`))).toBe(BLUE[step]);
    });
  }

  it('keeps every blue step inside sRGB (no silent clipping)', () => {
    for (const step of STEPS) {
      for (const v of token(`blue-${step}`)) {
        expect(v).toBeGreaterThanOrEqual(-0.002);
        expect(v).toBeLessThanOrEqual(1.002);
      }
    }
  });

  it('maps every 3D role to a custom property that exists in tokens.css', () => {
    for (const name of Object.values(PALETTE_CSS_VARS)) expect(tokensCss).toContain(`${name}:`);
    expect(Object.keys(PALETTE_CSS_VARS).sort()).toEqual(Object.keys(SCENE_BLUE).sort());
  });

  it('keeps neutrals and logo colours consistent', () => {
    expect(toHex(BLACK)).toBe(NEUTRAL.black);
    expect(toHex(WHITE)).toBe(NEUTRAL.white);
    expect(LOGO_COLOR.rim).toBe(SCENE_BLUE.rim);
  });
});

describe('WCAG 2.2 AA for the pairs introduced by the blue family', () => {
  const accent = token('blue-500');
  // --accent-hover = accent with lightness - 0.05 (relative colour in tokens.css)
  const accentHover = oklchToRgb(0.5, 0.2, 260);
  const navy = token('blue-100');
  const navyRaised = token('blue-200');

  const text: Array<[string, readonly number[], readonly number[]]> = [
    ['accent-foreground (white) on accent', WHITE, accent],
    ['accent-foreground (white) on accent-hover', WHITE, accentHover],
    ['accent-text on black', token('blue-700'), BLACK],
    ['accent-text on surface-navy', token('blue-700'), navy],
    ['accent-text on surface-navy-raised', token('blue-700'), navyRaised],
    ['foreground on surface-navy', WHITE, navy],
    ['muted-foreground on surface-navy', MUTED_FG, navy],
  ];
  for (const [name, fg, bg] of text) {
    it(`${name} >= 4.5:1`, () => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  // UI parts and focus indicators: 3:1 (WCAG 1.4.11)
  const ui: Array<[string, readonly number[], readonly number[]]> = [
    ['ring (glow) on black', token('blue-800'), BLACK],
    ['ring (glow) on surface-navy', token('blue-800'), navy],
    ['accent fill on black', accent, BLACK],
    ['accent fill on surface-navy (market bar on its track)', accent, navy],
    ['accent-hover fill on black', accentHover, BLACK],
    ['border-accent on black', token('blue-600'), BLACK],
    ['border-accent on surface-navy', token('blue-600'), navy],
  ];
  for (const [name, fg, bg] of ui) {
    it(`${name} >= 3:1`, () => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  }
});
