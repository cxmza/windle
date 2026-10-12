import { type CSSProperties, Fragment, useId } from 'react';
import { STAGGER } from '@/lib/motion-tokens';
import { Kicker } from './Chapter';

const MARK_WORD = 'Solana';
const VIEWBOX = '0 0 397.7 311.7';
const SOLANA_BARS = [
  'M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z',
  'M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z',
  'M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z',
] as const;

const BARS_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}">${SOLANA_BARS.map((d) => `<path d="${d}"/>`).join('')}</svg>`,
)}")`;

type SlotStyle = CSSProperties & { '--i'?: number; '--b'?: number; '--kicker-step'?: string; '--mark-mask'?: string };

function SolanaMark({ slot }: { slot: number }) {
  const gradient = `solana-${useId().replace(/\W/g, '')}`;
  const style: SlotStyle = { '--i': slot, '--mark-mask': BARS_MASK };
  return (
    <span data-solana-mark style={style}>
      <svg viewBox={VIEWBOX} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="311.7" x2="397.7" y2="0">
            <stop offset="0" className="[stop-color:var(--solana-from)]" />
            <stop offset="1" className="[stop-color:var(--solana-to)]" />
          </linearGradient>
        </defs>
        {SOLANA_BARS.map((d, b) => {
          const barStyle: SlotStyle = { '--b': b };
          return <path key={d} data-solana-bar d={d} fill={`url(#${gradient})`} style={barStyle} />;
        })}
      </svg>
      <span data-solana-sheen />
    </span>
  );
}

type Token =
  | { kind: 'char'; key: string; ch: string; slot: number }
  | { kind: 'space'; key: string }
  | { kind: 'mark'; key: string; slot: number };

function tokenize(text: string): Token[] {
  const at = text.indexOf(MARK_WORD);
  const tokens: Token[] = [];
  let slot = 0;
  Array.from(text).forEach((ch, i) => {
    if (i === at) tokens.push({ kind: 'mark', key: 'mark', slot: slot++ });
    tokens.push(ch === ' ' ? { kind: 'space', key: `s${i}` } : { kind: 'char', key: `c${i}`, ch, slot: slot++ });
  });
  return tokens;
}

/**
 * The hero kicker: the label sweeps in char by char (CSS, staggered by --i), the Solana mark takes one slot of the
 * sweep right before its word, its bars slide in one after another, then a slow sheen crosses the mark. Screen
 * readers get the plain text; the split copy is aria-hidden.
 */
export function HeroKicker({ text }: { text: string }) {
  const tokens = tokenize(text);
  const slots = tokens.filter((t) => t.kind !== 'space').length;
  const step = Math.min(STAGGER.char, STAGGER.kickerSpan / Math.max(slots - 1, 1));
  const style: SlotStyle = { '--kicker-step': `${step}s` };
  return (
    <Kicker>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-kicker-split style={style}>
        {tokens.map((t) => {
          if (t.kind === 'space') return <Fragment key={t.key}> </Fragment>;
          if (t.kind === 'mark') return <SolanaMark key={t.key} slot={t.slot} />;
          const charStyle: SlotStyle = { '--i': t.slot };
          return (
            <span key={t.key} data-kicker-char style={charStyle}>
              {t.ch}
            </span>
          );
        })}
      </span>
    </Kicker>
  );
}
