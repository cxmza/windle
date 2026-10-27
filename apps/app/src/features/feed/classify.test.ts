import { describe, expect, it } from 'vitest';
import { classifyTweet } from './classify';

describe('classifyTweet', () => {
  it.each([
    'v2 vaults ship Friday. withdrawal queue included.',
    'listing within a week. we cannot name the venue yet.',
    'staking v2 goes to mainnet this Friday.',
    'we burn 20% of the supply at 12:00 UTC Saturday.',
    'the audit report drops Monday, no criticals.',
    'treasury plan executes by end of month',
    'mobile beta will go live in 10 days',
    'we will open source the matching engine',
  ])('reads a dated commitment as a promise: %s', (text) => {
    expect(classifyTweet(text)).toBe('promise');
  });

  it.each([
    'v2 vaults shipped to devnet. mainnet next.',
    'progress: 80% of the withdrawal queue is merged, testing now.',
    'just deployed the new indexer to staging',
    'audit complete, fixes in review',
  ])('reads a status line as an update: %s', (text) => {
    expect(classifyTweet(text)).toBe('update');
  });

  it.each(['gm', 'ngmi if you sold the dip', '@kestrel_hq when listing by friday', 'will v2 ship by Friday?', ''])(
    'leaves chatter, replies and questions alone: %j',
    (text) => {
      expect(classifyTweet(text)).toBe('other');
    },
  );

  it('prefers the past tense over a future cue', () => {
    expect(classifyTweet('shipped v1 last week, v2 ships Friday')).toBe('update');
  });
});
