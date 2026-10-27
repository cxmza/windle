import { describe, expect, it } from 'vitest';
import { CandlesQuery, CreateMarketRequest } from './api.ts';
import {
  DURATION_PRESET_IDS,
  DURATION_PRESETS,
  durationPresetOf,
  MARKET_MAX_DURATION_MS,
  MARKET_MIN_DURATION_MS,
} from './duration.ts';

const request = {
  tweetUrl: 'https://x.com/sproutfi_dev/status/1846811200000010001',
  statement: 'Sprout deploys staking v2 to Solana mainnet by Friday.',
  criteria: 'YES if staking v2 is deployed on Solana mainnet before the deadline.',
  project: { name: 'Sproutfi', ticker: 'SPRT' },
  source: {
    id: '1846811200000010001',
    url: 'https://x.com/sproutfi_dev/status/1846811200000010001',
    author: { handle: 'sproutfi_dev', name: 'Sprout' },
    text: 'staking v2 ships friday',
    createdAt: '2026-10-17T10:00:00.000Z',
    capturedAt: '2026-10-17T11:00:00.000Z',
  },
};

describe('duration presets', () => {
  it('cover every id once, shortest first, inside the allowed window, one recommended', () => {
    expect(DURATION_PRESETS.map((p) => p.id)).toEqual([...DURATION_PRESET_IDS]);
    const ms = DURATION_PRESETS.map((p) => p.ms);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    for (const p of DURATION_PRESETS) {
      expect(p.ms).toBeGreaterThanOrEqual(MARKET_MIN_DURATION_MS);
      expect(p.ms).toBeLessThanOrEqual(MARKET_MAX_DURATION_MS);
    }
    expect(DURATION_PRESETS.filter((p) => p.recommended).map((p) => p.id)).toEqual(['day']);
    expect(durationPresetOf('flash')).toMatchObject({ ms: 15 * 60_000, risk: 'extreme' });
    expect(MARKET_MIN_DURATION_MS).toBe(15 * 60_000);
  });

  it('lets a create request carry a preset instead of a deadline, but not neither', () => {
    expect(CreateMarketRequest.safeParse({ ...request, durationPreset: 'day' }).success).toBe(true);
    expect(CreateMarketRequest.safeParse({ ...request, deadline: '2026-10-20T00:00:00.000Z' }).success).toBe(true);
    expect(CreateMarketRequest.safeParse(request).success).toBe(false);
    expect(CreateMarketRequest.safeParse({ ...request, durationPreset: 'hourly' }).success).toBe(false);
  });

  it('defaults and bounds the candles query', () => {
    expect(CandlesQuery.parse({})).toEqual({ tf: '5m', side: 'yes', limit: 300 });
    expect(CandlesQuery.safeParse({ limit: '1000' }).success).toBe(true);
    expect(CandlesQuery.safeParse({ limit: '1001' }).success).toBe(false);
    expect(CandlesQuery.safeParse({ tf: '2h' }).success).toBe(false);
  });
});
