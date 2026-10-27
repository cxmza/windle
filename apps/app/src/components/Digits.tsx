import { useState } from 'react';

type Dir = 'up' | 'down' | 'auto';

const keysOf = (text: string): string[] => {
  const chars = [...text];
  return chars.map((c, i) => `${chars.length - i}:${c}`);
};

const numeric = (text: string): number => Number(text.replace(/\D/g, '')) || 0;

/**
 * Text whose changed digits slide in (from below when the value rises, from above when it falls); unchanged digits
 * stay put. Keys run from the right, so 9 → 10 only moves the digits that changed. Pass `value` when the text alone
 * cannot tell the direction (signed numbers).
 */
export function Digits({ text, value, dir = 'auto' }: { text: string; value?: number; dir?: Dir }) {
  const [state, setState] = useState({ text, prev: text, value, prevValue: value });
  if (state.text !== text) setState({ text, prev: state.text, value, prevValue: state.value });
  const old = new Set(keysOf(state.prev));
  const rose =
    state.value !== undefined && state.prevValue !== undefined
      ? state.value >= state.prevValue
      : numeric(state.text) >= numeric(state.prev);
  const way = dir === 'auto' ? (rose ? 'up' : 'down') : dir;
  return (
    <span data-digits data-dir={way}>
      {keysOf(text).map((k) => {
        const c = k.slice(k.indexOf(':') + 1);
        return /\d/.test(c) ? (
          <span key={k} data-digit data-new={old.has(k) ? undefined : true}>
            {c}
          </span>
        ) : (
          <span key={k}>{c}</span>
        );
      })}
    </span>
  );
}
