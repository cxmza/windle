import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whenIdle } from './idle';

// jsdom has no requestIdleCallback: the queue falls back to setTimeout(16), which fake timers drive.
describe('whenIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs jobs in order, one per idle slot, and skips cancelled ones', () => {
    const ran: string[] = [];
    whenIdle(() => ran.push('a'));
    const cancel = whenIdle(() => ran.push('b'));
    whenIdle(() => ran.push('c'));
    cancel();
    vi.advanceTimersByTime(16);
    expect(ran).toEqual(['a']);
    vi.advanceTimersByTime(16);
    expect(ran).toEqual(['a', 'c']);
  });

  it('waits for the scroll to settle unless the job is urgent', () => {
    const ran: string[] = [];
    whenIdle(() => ran.push('later'));
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
    expect(ran).toEqual([]); // mid-scroll: deferred
    vi.advanceTimersByTime(250);
    expect(ran).toEqual(['later']); // settled

    whenIdle(() => ran.push('urgent'), { urgent: () => true });
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(16);
    expect(ran).toEqual(['later', 'urgent']);
  });

  it('does not defer a job forever during continuous scrolling', () => {
    const ran: string[] = [];
    whenIdle(() => ran.push('job'));
    for (let t = 0; t < 4000 && ran.length === 0; t += 50) {
      window.dispatchEvent(new Event('wheel'));
      vi.advanceTimersByTime(50);
    }
    expect(ran).toEqual(['job']);
  });
});
