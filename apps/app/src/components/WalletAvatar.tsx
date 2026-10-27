import type { ComponentPropsWithRef } from 'react';

type Props = Omit<ComponentPropsWithRef<'span'>, 'children'> & { address: string };

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic gradient disc derived from the address; the same wallet always gets the same face. */
export function WalletAvatar({ address, className, style, ...props }: Props) {
  const h = hash(address);
  const hueA = h % 360;
  const hueB = (hueA + 70 + ((h >>> 9) % 140)) % 360;
  const angle = (h >>> 17) % 360;
  return (
    <span
      aria-hidden="true"
      data-wallet-avatar
      style={{
        backgroundImage: `linear-gradient(${angle}deg, oklch(0.72 0.14 ${hueA}), oklch(0.58 0.16 ${hueB}))`,
        ...style,
      }}
      className={`inline-block shrink-0 rounded-full ${className ?? ''}`}
      {...props}
    />
  );
}
