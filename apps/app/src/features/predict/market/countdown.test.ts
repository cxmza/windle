import { describe, expect, it } from 'vitest';
import { makeMarket } from '../test-support';
import { chipState, formatCountdown } from './countdown';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatCountdown', () => {
  it('counts hh:mm:ss under a day', () => {
    expect(formatCountdown(HOUR + 7 * MIN + 12 * SEC)).toBe('01:07:12');
    expect(formatCountdown(59 * SEC)).toBe('00:00:59');
    expect(formatCountdown(DAY - SEC)).toBe('23:59:59');
  });

  it('switches to days and hours from a day up', () => {
    expect(formatCountdown(DAY)).toBe('1d 0h');
    expect(formatCountdown(29 * DAY + 23 * HOUR + 59 * MIN)).toBe('29d 23h');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-5 * SEC)).toBe('00:00:00');
  });
});

describe('chipState', () => {
  const now = Date.now();
  const open = (over: Parameters<typeof makeMarket>[0]) =>
    makeMarket({ deadline: new Date(now + HOUR).toISOString(), ...over });

  it.each([
    ['flash', 'extreme'],
    ['fast', 'high'],
    ['slow', 'medium'],
    ['day', 'standard'],
    ['week', 'low'],
    ['month', 'low'],
  ] as const)('colors the %s preset by its %s risk', (id, risk) => {
    const state = chipState(open({ durationPreset: id }), now);
    expect(state).toMatchObject({ kind: 'counting', tone: risk, label: id.toUpperCase() });
  });

  it('keeps a custom deadline neutral', () => {
    expect(chipState(open({ durationPreset: null }), now)).toMatchObject({
      kind: 'counting',
      tone: 'custom',
      label: 'CUSTOM',
    });
    expect(chipState(open({}), now)).toMatchObject({ tone: 'custom' });
  });

  it('says Closing at the deadline and Closed, Resolved or Voided afterwards', () => {
    expect(chipState(open({ deadline: new Date(now - SEC).toISOString() }), now)).toMatchObject({
      kind: 'ended',
      text: 'Closing',
    });
    expect(chipState(makeMarket({ status: 'closed' }), now)).toMatchObject({ kind: 'ended', text: 'Closed' });
    expect(chipState(makeMarket({ status: 'resolved' }), now)).toMatchObject({ kind: 'ended', text: 'Resolved' });
    expect(chipState(makeMarket({ status: 'voided' }), now)).toMatchObject({ kind: 'ended', text: 'Voided' });
  });
});
