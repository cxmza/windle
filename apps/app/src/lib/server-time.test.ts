import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeResponse,
  observeServerLowerBound,
  observeServerTime,
  resetServerTime,
  serverNow,
  serverOffset,
} from './server-time';

beforeEach(() => resetServerTime());
afterEach(() => {
  vi.useRealTimers();
  resetServerTime();
});

describe('server time', () => {
  it('is the local clock until something is observed', () => {
    expect(serverOffset()).toBe(0);
  });

  it('derives the offset of a machine that runs 40 s behind', () => {
    const sentAt = 1_000_000_000;
    const receivedAt = sentAt + 100;
    observeServerTime(sentAt + 40_000, sentAt, receivedAt);
    expect(serverOffset()).toBe(40_450);
  });

  it('reads the Date header of a response', () => {
    const sentAt = Date.parse('2026-10-13T11:59:20.000Z');
    const res = new Response(null, { headers: { date: 'Tue, 13 Oct 2026 12:00:00 GMT' } });
    observeResponse(res, sentAt, sentAt + 80);
    expect(serverOffset()).toBe(Date.parse('2026-10-13T12:00:00.500Z') - (sentAt + 40));
  });

  it('keeps the sample with the shortest round trip', () => {
    observeServerTime(1_000_040_000, 1_000_000_000, 1_000_000_400);
    const slow = serverOffset();
    observeServerTime(1_000_040_000, 1_000_000_000, 1_000_000_040);
    expect(serverOffset()).not.toBe(slow);
    expect(serverOffset()).toBe(40_480);
    observeServerTime(1_000_041_000, 1_000_000_000, 1_000_000_900);
    expect(serverOffset()).toBe(40_480);
  });

  it('ignores a response that took too long to say anything about the time', () => {
    observeServerTime(1_000_040_000, 1_000_000_000, 1_000_009_000);
    expect(serverOffset()).toBe(0);
  });

  it('never lets the offset fall below a moment the server has certainly passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    observeServerLowerBound(1_000_034_500);
    expect(serverOffset()).toBe(34_500);
    expect(serverNow()).toBe(1_000_034_500);
  });
});
