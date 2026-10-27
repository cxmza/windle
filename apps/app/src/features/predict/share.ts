import { type ApiMarket, SIDE_LABELS } from '@windle/shared';

export const SHARE_ORIGIN = 'https://app.windle.fun';

type Shareable = Pick<ApiMarket, 'slug' | 'statement' | 'probYes' | 'tier'> & { shareUrl?: string | undefined };

const STATEMENT_MAX = 170;

/** The short public link; its page carries the preview card. The api's own `shareUrl` wins when present. */
export const shareLink = (m: Pick<Shareable, 'slug' | 'shareUrl'>): string =>
  m.shareUrl || `${SHARE_ORIGIN}/s/${encodeURIComponent(m.slug)}`;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > STATEMENT_MAX ? `${flat.slice(0, STATEMENT_MAX - 1).trimEnd()}…` : flat;
}

/** The pre-filled X post: the promise, the current odds, and the link as the `url` so X attaches the card. */
export function xIntentUrl(m: Shareable): string {
  const yes = Math.round(m.probYes * 100);
  const text = `${clip(m.statement)}\n\n${SIDE_LABELS[m.tier].yes} ${yes}% on windle (practice points)`;
  const params = new URLSearchParams({ text, url: shareLink(m) });
  return `https://x.com/intent/post?${params.toString()}`;
}
