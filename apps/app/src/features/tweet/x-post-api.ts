import { XPost } from '@windle/shared';
import { API_URL } from '@/lib/env';
import { observeResponse } from '@/lib/server-time';

/**
 * `enriched`: the post carries what X itself returned. `degraded`: enrichment was asked for but the api could not do it
 * (no key, no budget, provider down), so this is the relay's copy.
 */
export type XPostResult =
  | { status: 'ok'; post: XPost; enriched: boolean; degraded: boolean }
  | { status: 'not_found' }
  | { status: 'rate_limited'; retryAfterMs: number | null }
  | { status: 'unavailable' }
  | { status: 'offline' };

const TTL_MS = 30_000;

const settled = new Map<string, { at: number; result: Extract<XPostResult, { status: 'ok' }> }>();
const inFlight = new Map<string, Promise<XPostResult>>();

const keyOf = (id: string, enrich: boolean) => `${id}:${enrich ? 'x' : 'r'}`;

async function errorCode(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const err = body.error;
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : null;
}

function retryAfter(res: Response): number | null {
  const s = Number(res.headers.get('retry-after'));
  return Number.isFinite(s) && s > 0 ? s * 1000 : null;
}

async function request(base: string, id: string, enrich: boolean): Promise<XPostResult | { status: 'enrich_down' }> {
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base}/v1/x/post/${encodeURIComponent(id)}${enrich ? '?enrich=1' : ''}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    return { status: 'offline' };
  }
  observeResponse(res, sentAt, Date.now());
  if (res.status === 404) return { status: 'not_found' };
  if (res.status === 429) return { status: 'rate_limited', retryAfterMs: retryAfter(res) };
  if (res.status === 503)
    return enrich && (await errorCode(res)) === 'x_enrich_unavailable'
      ? { status: 'enrich_down' }
      : { status: 'unavailable' };
  if (!res.ok) return { status: 'unavailable' };
  const parsed = XPost.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { status: 'unavailable' };
  const post = parsed.data;
  return { status: 'ok', post, enriched: enrich && post.enrichedAt != null, degraded: false };
}

async function fetchPost(base: string, id: string, enrich: boolean): Promise<XPostResult> {
  const first = await request(base, id, enrich);
  if (first.status !== 'enrich_down') return first;
  const relay = await request(base, id, false);
  return relay.status === 'ok'
    ? { ...relay, degraded: true }
    : relay.status === 'enrich_down'
      ? { status: 'unavailable' }
      : relay;
}

/**
 * One post by id. `enrich` asks the api to fetch the full post from X (metered): use it for a link somebody pasted, the
 * market's own tweet, or a row somebody opened, never for every post of the live feed. Concurrent calls for the same
 * post share one request, and a good answer is reused for 30 s.
 */
export function loadXPost(id: string, enrich: boolean, base: string = API_URL): Promise<XPostResult> {
  const key = keyOf(id, enrich);
  const hit = settled.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.result);
  const running = inFlight.get(key);
  if (running) return running;
  const p = fetchPost(base, id, enrich)
    .then((result) => {
      if (result.status === 'ok') settled.set(key, { at: Date.now(), result });
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export function clearXPostCache(): void {
  settled.clear();
  inFlight.clear();
}
