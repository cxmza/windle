import { CreateMarketRequest } from '@windle/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeImage } from '../../media/test-support';
import {
  buildInput,
  DRAFT_KEY,
  type Draft,
  dateBounds,
  emptyDraft,
  firstErrorStep,
  isMint,
  loadDraft,
  mapApiError,
  parseDraft,
  presetDeadline,
  saveDraft,
  suggestStatement,
  validateMarketStep,
  validateTweetStep,
} from './draft';

const NOW = new Date(2026, 9, 12, 12, 0).getTime();
const DAY = 86_400_000;

const tweet = {
  id: '1846811200000000011',
  url: 'https://x.com/glowbyte_sol/status/1846811200000000011',
  author: { handle: 'glowbyte_sol', name: 'Glowbyte' },
  text: 'v1 of the Glowbyte launchpad ships next Wednesday. reply with your wallet.',
  createdAt: '2026-10-12T10:00:00.000Z',
  capturedAt: '2026-10-12T11:00:00.000Z',
};

function valid(over: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    step: 1,
    url: tweet.url,
    tweet,
    projectName: 'Glowbyte',
    ticker: '$glow',
    statement: 'Glowbyte launches v1 of its launchpad',
    criteria: 'YES if: the launchpad is live on mainnet.',
    ...presetDeadline(30, NOW),
    ...over,
  };
}

beforeEach(() => window.sessionStorage.clear());

describe('suggestStatement', () => {
  it('takes the first sentence without links and caps it at 200 characters', () => {
    expect(suggestStatement(tweet.text)).toBe('v1 of the Glowbyte launchpad ships next Wednesday.');
    expect(suggestStatement('we ship https://example.com/x soon')).toBe('we ship soon');
    expect(suggestStatement('a'.repeat(300))).toHaveLength(200);
  });
});

describe('validation', () => {
  it('accepts a complete draft', () => {
    expect(validateMarketStep(valid(), NOW)).toEqual({});
    expect(validateTweetStep(valid())).toEqual({});
  });

  it('reports each field with its own message', () => {
    const errors = validateMarketStep(
      valid({ projectName: 'G', ticker: 'toolongticker1', mint: 'not-a-mint', statement: 'short', criteria: '' }),
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual(['criteria', 'mint', 'projectName', 'statement', 'ticker']);
  });

  it('validates the mint as base58 of 32 to 44 characters', () => {
    expect(isMint('7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy')).toBe(true);
    expect(isMint('0OIl7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5')).toBe(false);
    expect(isMint('short')).toBe(false);
    expect(validateMarketStep(valid({ mint: '   ' }), NOW).mint).toBeUndefined();
  });

  it('keeps the deadline between one hour and a year from now', () => {
    const at = (ms: number) => {
      const d = new Date(ms);
      const p = (n: number) => String(n).padStart(2, '0');
      return {
        deadlineDate: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        deadlineTime: `${p(d.getHours())}:${p(d.getMinutes())}`,
      };
    };
    expect(validateMarketStep(valid({ duration: 'custom', ...at(NOW + 30 * 60_000) }), NOW).deadline).toMatch(
      /one hour/,
    );
    expect(validateMarketStep(valid({ duration: 'custom', ...at(NOW + 2 * 3_600_000) }), NOW).deadline).toBeUndefined();
    expect(validateMarketStep(valid({ duration: 'custom', ...at(NOW + 400 * DAY) }), NOW).deadline).toMatch(
      /within a year/,
    );
    expect(validateMarketStep(valid({ duration: 'custom', deadlineDate: '', deadlineTime: '' }), NOW).deadline).toMatch(
      /date and a time/,
    );
    expect(dateBounds(NOW).min <= dateBounds(NOW).max).toBe(true);
  });

  it('needs a tweet that matches the pasted link', () => {
    expect(validateTweetStep(valid({ url: '' })).url).toMatch(/Paste/);
    expect(validateTweetStep(valid({ url: 'https://example.com/x' })).url).toMatch(/x.com/);
    expect(validateTweetStep(valid({ tweet: null })).url).toMatch(/Wait/);
    expect(validateTweetStep(valid({ url: 'https://x.com/glowbyte_sol/status/1846811200000000022' })).url).toMatch(
      /Wait/,
    );
  });
});

describe('buildInput', () => {
  it('produces input the shared schema accepts, with the ticker normalised', () => {
    const input = buildInput(valid({ oddsPct: 62, mint: '7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy' }));
    expect(input).not.toBeNull();
    const parsed = CreateMarketRequest.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.project.ticker).toBe('GLOW');
    expect(parsed.data?.initialProbYes).toBeCloseTo(0.62);
    expect(parsed.data?.tweetUrl).toBe(tweet.url);
    expect(parsed.data?.source.id).toBe(tweet.id);
  });

  it('is null without a tweet, or without a deadline when the date is custom', () => {
    expect(buildInput(valid({ tweet: null }))).toBeNull();
    expect(buildInput(valid({ duration: 'custom', deadlineDate: '' }))).toBeNull();
  });

  it('sends a preset as durationPreset and ignores any stale date', () => {
    const input = buildInput(valid({ duration: 'fast' }));
    expect(input).toMatchObject({ durationPreset: 'fast' });
    expect(input).not.toHaveProperty('deadline');
    expect(CreateMarketRequest.safeParse(input).success).toBe(true);
  });

  it('sends a custom date as a deadline only', () => {
    const input = buildInput(valid({ duration: 'custom' }));
    expect(input).toHaveProperty('deadline');
    expect(input).not.toHaveProperty('durationPreset');
    expect(CreateMarketRequest.safeParse(input).success).toBe(true);
  });

  it('needs no date for a preset', () => {
    expect(
      validateMarketStep(valid({ duration: 'day', deadlineDate: '', deadlineTime: '' }), NOW).deadline,
    ).toBeUndefined();
  });
});

describe('mapApiError', () => {
  it('pins a refusal on the wizard field it is about and finds the earliest step', () => {
    const deadline = mapApiError('invalid_deadline', 'too soon');
    expect(deadline).toEqual({ errors: { deadline: 'too soon' }, rest: [] });
    const url = mapApiError('tweet_not_found', 'gone');
    expect(url.errors).toEqual({ url: 'gone' });
    expect(firstErrorStep(url.errors)).toBe(0);
    expect(firstErrorStep(deadline.errors)).toBe(1);
    expect(firstErrorStep({})).toBeNull();
  });

  it('reads the path out of a validation_failed message and keeps the unknown ones as rest', () => {
    expect(mapApiError('validation_failed', 'body/project/ticker: 2-10 letters or digits').errors).toEqual({
      ticker: '2-10 letters or digits',
    });
    expect(mapApiError('validation_failed', 'body/liquidityB: too big')).toEqual({
      errors: {},
      rest: ['body/liquidityB: too big'],
    });
    expect(mapApiError('rate_limited', 'slow down')).toEqual({ errors: {}, rest: ['slow down'] });
  });
});

describe('market image in the draft', () => {
  it('is sent as imageId, and left out when there is none', () => {
    const image = makeImage(3);
    const withImage = buildInput(valid({ image }));
    expect(CreateMarketRequest.safeParse(withImage).success).toBe(true);
    expect(withImage?.imageId).toBe(image.id);
    expect(buildInput(valid())).not.toHaveProperty('imageId');
  });

  it('survives a reload, and a malformed stored image is dropped', () => {
    const image = makeImage(4);
    saveDraft(valid({ image }));
    expect(loadDraft()?.image).toEqual(image);
    expect(parseDraft({ ...valid(), image: { id: 'x' } })?.image).toBeNull();
  });

  it('counts as content, so an image alone keeps the draft', () => {
    saveDraft({ ...emptyDraft(), image: makeImage(5) });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('pins an image refusal on the Market step', () => {
    expect(mapApiError('media_removed', 'removed')).toEqual({ errors: { image: 'removed' }, rest: [] });
    expect(firstErrorStep({ image: 'x' })).toBe(1);
  });
});

describe('draft persistence', () => {
  it('round-trips through sessionStorage', () => {
    saveDraft(valid({ step: 2, oddsPct: 70 }));
    expect(loadDraft()).toMatchObject({ step: 2, oddsPct: 70, projectName: 'Glowbyte', tweet: { id: tweet.id } });
  });

  it('removes a blank draft and survives junk or blocked storage', () => {
    saveDraft(valid());
    saveDraft(emptyDraft());
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    window.sessionStorage.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft()).toBeNull();
    expect(parseDraft('x')).toBeNull();
    expect(parseDraft({ step: 2, url: 'u', oddsPct: 400, tweet: { nope: true } })).toMatchObject({
      step: 0,
      oddsPct: 95,
    });
  });
});
