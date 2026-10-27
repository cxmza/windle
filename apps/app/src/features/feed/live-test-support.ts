import type { XPost } from '@windle/shared';
import type { DriverEnv } from '@/lib/timers';
import type { StreamLike } from './live-source';

export function fakeEnv() {
  let now = Date.parse('2026-10-12T12:00:00.000Z');
  let seq = 0;
  let hidden = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const visibility = new Set<() => void>();
  const env: DriverEnv = {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    hidden: () => hidden,
    onVisibilityChange: (fn) => {
      visibility.add(fn);
      return () => visibility.delete(fn);
    },
  };
  return {
    env,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      now = end;
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const fn of visibility) fn();
    },
  };
}

export class FakeStream implements StreamLike {
  static all: FakeStream[] = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private handlers = new Map<string, (event: MessageEvent) => void>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeStream.all.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.handlers.set(type, listener);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  emit(type: string, data: unknown) {
    this.readyState = 1;
    this.handlers.get(type)?.(new MessageEvent(type, { data: typeof data === 'string' ? data : JSON.stringify(data) }));
  }

  fail(readyState: 0 | 2) {
    this.readyState = readyState;
    this.onerror?.(new Event('error'));
  }

  static reset() {
    FakeStream.all = [];
  }

  static last(): FakeStream {
    const s = FakeStream.all.at(-1);
    if (!s) throw new Error('no stream opened');
    return s;
  }
}

const idOf = (n: number): string => String(1_800_000_000_000_000_000n + BigInt(n));

export const post = (n: number, over: Partial<XPost> = {}): XPost => ({
  id: idOf(n),
  kind: 'tweet',
  createdAt: new Date(Date.parse('2026-10-12T11:00:00.000Z') + n * 1000).toISOString(),
  receivedAt: new Date(Date.parse('2026-10-12T11:00:01.000Z') + n * 1000).toISOString(),
  url: `https://x.com/alice/status/${idOf(n)}`,
  author: {
    id: '1',
    handle: 'alice',
    name: 'Alice',
    avatarUrl: 'https://pbs.twimg.com/profile_images/1/alice_normal.jpg',
    followers: 1000,
    tags: ['kol'],
  },
  text: `post number ${n}`,
  media: [],
  quoted: null,
  inReplyTo: null,
  source: 'twitterapi',
  ...over,
});
