import { API_ERROR_CODES } from '@windle/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { errorMessage, existingSlug, isNotFound } from './errors';

const http = (code: string, status = 422, details: Record<string, string> = {}) =>
  new ApiRequestError('http', 'raw server text', status, code, details);

describe('errorMessage', () => {
  const FALLBACK = 'Something else happened.';

  it.each([
    ['creator_cannot_trade', /You created this market/],
    ['insufficient_balance', /Not enough practice points/],
    ['insufficient_shares', /do not hold that many shares/],
    ['slippage_exceeded', /price moved/],
    ['market_closed', /Trading on this market is closed/],
    ['market_already_resolved', /already been resolved/],
    ['resolve_too_early', /only after the deadline/],
    ['duplicate_tweet', /market for this tweet already exists/],
    ['tweet_mismatch', /does not match the tweet/],
    ['tweet_not_found', /could not find that tweet/],
    ['market_tier_unsupported', /Only community markets/],
    ['invalid_deadline', /between one hour and one year/],
    ['invalid_amount', /not valid/],
    ['invalid_tweet_url', /link to a post on X/],
    ['rate_limited', /Too many requests/],
    ['forbidden', /creator of this market or an admin/],
    ['market_not_found', /no longer available/],
    ['unauthenticated', /session ended/],
  ])('maps %s to words a person can act on', (code, copy) => {
    const text = errorMessage(http(code), FALLBACK);
    expect(text).toMatch(copy);
    expect(text).not.toContain('raw server text');
    expect(text).not.toContain(code);
  });

  it('covers every error code the exchange can return', () => {
    const exchange = [
      'creator_cannot_trade',
      'insufficient_balance',
      'insufficient_shares',
      'slippage_exceeded',
      'market_closed',
      'market_already_resolved',
      'resolve_too_early',
      'duplicate_tweet',
      'tweet_mismatch',
      'tweet_not_found',
      'market_tier_unsupported',
      'invalid_deadline',
      'invalid_amount',
      'invalid_tweet_url',
    ] as const;
    for (const code of exchange) {
      expect(API_ERROR_CODES).toContain(code);
      expect(errorMessage(http(code), FALLBACK), code).not.toBe(FALLBACK);
    }
  });

  it('says the network is the problem when no answer came back', () => {
    expect(errorMessage(new ApiRequestError('network', 'x'), FALLBACK)).toMatch(/Could not reach windle/);
  });

  it('keeps the server message for a validation failure, and the fallback for the unknown', () => {
    expect(errorMessage(http('validation_failed', 400), FALLBACK)).toBe('raw server text');
    expect(errorMessage(http('something_new', 500), FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(new ApiRequestError('schema', 'x'), FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(new Error('boom'), FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});

describe('error helpers', () => {
  it('reads the existing slug of a duplicate, and not-found', () => {
    expect(existingSlug(http('duplicate_tweet', 409, { existingSlug: 'taken' }))).toBe('taken');
    expect(existingSlug(http('slippage_exceeded', 422, { existingSlug: 'ignored' }))).toBeUndefined();
    expect(isNotFound(http('market_not_found', 404))).toBe(true);
    expect(isNotFound(new ApiRequestError('http', 'x', 404, null))).toBe(true);
    expect(isNotFound(http('forbidden', 403))).toBe(false);
  });
});
