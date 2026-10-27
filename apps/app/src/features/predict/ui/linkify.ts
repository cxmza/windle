export type TweetToken =
  | { kind: 'text'; at: number; text: string }
  | { kind: 'link'; at: number; text: string; href: string; type: 'url' | 'mention' | 'hashtag' | 'cashtag' };

const PATTERN =
  /(https?:\/\/[^\s<>]+)|(?<![A-Za-z0-9_])(@[A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])|(?<![\p{L}\p{N}_&])(#[\p{L}\p{N}_]{1,50})|(?<![A-Za-z0-9_$])(\$[A-Za-z][A-Za-z0-9]{1,9})(?![A-Za-z0-9_])/gu;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Only http(s) survives: javascript:, data: and friends never become an href. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function displayUrl(href: string, max = 32): string {
  const bare = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return bare.length > max ? `${bare.slice(0, max - 1)}…` : bare;
}

/** Splits tweet text into plain text and links (URLs, @mentions, #tags, $cashtags). Only http(s) targets are produced. */
export function tokenizeTweet(text: string): TweetToken[] {
  const out: TweetToken[] = [];
  let last = 0;
  const push = (t: TweetToken) => {
    const prev = out[out.length - 1];
    if (t.kind === 'text' && prev?.kind === 'text') prev.text += t.text;
    else out.push(t);
  };
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) push({ kind: 'text', at: last, text: text.slice(last, start) });
    let raw = m[0];
    let tail = '';
    if (m[1]) {
      const trimmed = raw.replace(TRAILING, '');
      tail = raw.slice(trimmed.length);
      raw = trimmed;
    }
    const type = m[1] ? 'url' : m[2] ? 'mention' : m[3] ? 'hashtag' : 'cashtag';
    const body = encodeURIComponent(raw.slice(1));
    const href =
      type === 'url'
        ? safeHref(raw)
        : type === 'mention'
          ? `https://x.com/${body}`
          : type === 'hashtag'
            ? `https://x.com/hashtag/${body}`
            : `https://x.com/search?q=${encodeURIComponent(raw)}`;
    push(href ? { kind: 'link', at: start, text: raw, href, type } : { kind: 'text', at: start, text: raw });
    if (tail) push({ kind: 'text', at: start + raw.length, text: tail });
    last = start + m[0].length;
  }
  if (last < text.length) push({ kind: 'text', at: last, text: text.slice(last) });
  return out;
}
