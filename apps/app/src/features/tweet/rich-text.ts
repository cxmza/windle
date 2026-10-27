import type { XUrlEntity } from '@windle/shared';
import { type TweetToken, tokenizeTweet } from '../predict/ui/linkify';

export type RichToken = TweetToken | { kind: 'link'; at: number; text: string; href: string; type: 'url' };

const TRAILING_TCO = /\s*https:\/\/t\.co\/[A-Za-z0-9]+\s*$/;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Text as linked tokens. t.co links become the address they stand for (shown as X shows it, linked to the real
 * target); a t.co link left at the end is the post's own media or quote link and is dropped; @mentions, #hashtags
 * and $cashtags link to x.com.
 */
export function tokenizeRich(
  text: string,
  urls: readonly XUrlEntity[] | undefined,
  hasAttachment: boolean,
): RichToken[] {
  const body = hasAttachment ? text.replace(TRAILING_TCO, '') : text;
  const known = new Map((urls ?? []).map((u) => [u.url, u]));
  if (known.size === 0) return tokenizeTweet(body);
  const split = body.split(new RegExp(`(${[...known.keys()].map(escapeRegExp).join('|')})`));
  const out: RichToken[] = [];
  let at = 0;
  for (const part of split) {
    const entity = known.get(part);
    if (entity) {
      out.push({ kind: 'link', at, text: entity.displayUrl, href: entity.expandedUrl, type: 'url' });
    } else {
      for (const t of tokenizeTweet(part)) out.push({ ...t, at: at + t.at });
    }
    at += part.length;
  }
  return out;
}
