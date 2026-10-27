import { ApiRequestError } from '@/lib/api';

const COPY: Readonly<Record<string, string>> = {
  creator_cannot_trade: 'You created this market, so you cannot trade on it. You can resolve it instead.',
  insufficient_balance: 'Not enough practice points for this trade. Lower the amount or use Max.',
  insufficient_shares: 'You do not hold that many shares. Lower the amount or use Max.',
  slippage_exceeded: 'The price moved while the order was on its way. Check the new quote and try again.',
  market_closed: 'Trading on this market is closed.',
  market_already_resolved: 'This market has already been resolved with a different outcome.',
  resolve_too_early:
    'The “no” outcome can be decided only after the deadline. Until then the promise can still be kept.',
  forbidden: 'Only the creator of this market or an admin can resolve it.',
  market_not_found: 'This market is no longer available.',
  duplicate_tweet: 'A market for this tweet already exists.',
  tweet_mismatch: 'The link does not match the tweet that was previewed. Paste the link again.',
  tweet_not_found: 'We could not find that tweet. It may be deleted, private or from a protected account.',
  market_tier_unsupported: 'Only community markets can be created for now.',
  invalid_deadline: 'The deadline must be between one hour and one year from now.',
  invalid_amount: 'That amount is not valid. Trades start at 1 practice point.',
  invalid_tweet_url: 'That does not look like a link to a post on X.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  unauthenticated: 'Your session ended. Sign in again to continue.',
  service_unavailable: 'The service is busy. Try again in a few seconds.',
  x_feed_unavailable: 'X feed unavailable, try again.',
};

/** One sentence a person can act on. Unknown codes fall back to the server's own message, then to `fallback`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback;
  if (error.kind === 'network') return 'Could not reach windle. Check your connection and try again.';
  if (error.kind === 'schema') return fallback;
  const known = error.code ? COPY[error.code] : undefined;
  if (known) return known;
  return error.code === 'validation_failed' && error.message ? error.message : fallback;
}

export const existingSlug = (error: unknown): string | undefined =>
  error instanceof ApiRequestError && error.code === 'duplicate_tweet' ? error.details.existingSlug : undefined;

export const isNotFound = (error: unknown): boolean =>
  error instanceof ApiRequestError && (error.code === 'market_not_found' || error.status === 404);
