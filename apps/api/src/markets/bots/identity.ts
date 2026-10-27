/**
 * House market bots are system users with fixed ids, flagged `users.is_bot`. They have no wallet and cannot sign
 * in; their trades carry `bot: true`, a display name and, as `by`, a reserved id spelled `MarketBot<n>111…` (base58
 * shaped for the contract, never a key anyone holds).
 */

export const MAX_BOTS = 9;

export interface MarketBot {
  n: number;
  userId: string;
  address: string;
  name: string;
}

const ID_PREFIX = '00000000-0000-7000-8000-0000b070';

export function marketBot(n: number): MarketBot {
  if (!(Number.isInteger(n) && n >= 1 && n <= MAX_BOTS)) throw new RangeError(`bot number must be 1..${MAX_BOTS}`);
  return {
    n,
    userId: `${ID_PREFIX}${n.toString(16).padStart(4, '0')}`,
    address: `MarketBot${n}`.padEnd(40, '1'),
    name: `Market bot #${n}`,
  };
}

export function marketBots(count: number): MarketBot[] {
  return Array.from({ length: count }, (_, i) => marketBot(i + 1));
}

export function botNameOf(userId: string): string {
  if (!userId.startsWith(ID_PREFIX)) return 'Market bot';
  const n = Number.parseInt(userId.slice(ID_PREFIX.length), 16);
  return Number.isInteger(n) && n >= 1 && n <= MAX_BOTS ? marketBot(n).name : 'Market bot';
}
