import { type TweetSnapshot, tweetUrl } from '@windle/shared';
import { ACCOUNTS, mediaFor, POOL, type PoolEntry } from './pool';

const accountOf = (handle: string) => ACCOUNTS.find((a) => a.handle === handle);

export const poolOrigin = (): string => (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);

export const tweetId = (index: number, cycle: number): string =>
  `19${String(cycle).padStart(3, '0')}00000000${String(index).padStart(5, '0')}`;

/** One pool entry as a snapshot. */
export function buildTweet(index: number, cycle: number, createdMs: number): TweetSnapshot | null {
  const entry: PoolEntry | undefined = POOL[index];
  if (!entry) return null;
  const created = new Date(createdMs).toISOString();
  const account = accountOf(entry.handle);
  const id = tweetId(index, cycle);
  const media = mediaFor(entry.media, poolOrigin());
  return {
    id,
    url: tweetUrl(entry.handle, id),
    author: {
      handle: entry.handle,
      name: account?.name ?? entry.handle,
      ...(account?.verified ? { verified: true } : {}),
    },
    text: entry.text,
    createdAt: created,
    capturedAt: created,
    ...(media ? { media } : {}),
  };
}

export const tickerOf = (handle: string): string | undefined => accountOf(handle)?.ticker;
