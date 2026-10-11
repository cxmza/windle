import { monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * Minimal Prometheus text-format registry (exposition format 0.0.4). Enough for request counters, one latency
 * histogram and a few gauges; avoids prom-client for a handful of series.
 */
type Labels = Record<string, string>;

const escapeLabel = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelKey = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(labels[k] ?? '')}"`)
    .join(',');
const fmt = (name: string, key: string, value: number) => `${name}${key ? `{${key}}` : ''} ${value}`;

export class Counter {
  private readonly values = new Map<string, number>();
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels = {}, by = 1) {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  get(labels: Labels = {}) {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) out.push(fmt(this.name, key, value));
    return out;
  }
}

export class Gauge {
  private readonly values = new Map<string, number>();
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(labels: Labels, value: number) {
    this.values.set(labelKey(labels), value);
  }

  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, value] of this.values) out.push(fmt(this.name, key, value));
    return out;
  }
}

export class Histogram {
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();
  readonly name: string;
  readonly help: string;
  readonly buckets: number[];

  constructor(name: string, help: string, buckets: number[]) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: Labels, value: number) {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= (this.buckets[i] as number)) s.counts[i] = (s.counts[i] ?? 0) + 1;
    }
    s.sum += value;
    s.count += 1;
  }

  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, s] of this.series) {
      const sep = key ? `${key},` : '';
      this.buckets.forEach((le, i) => {
        out.push(`${this.name}_bucket{${sep}le="${le}"} ${s.counts[i] ?? 0}`);
      });
      out.push(`${this.name}_bucket{${sep}le="+Inf"} ${s.count}`);
      out.push(fmt(`${this.name}_sum`, key, s.sum));
      out.push(fmt(`${this.name}_count`, key, s.count));
    }
    return out;
  }
}

export interface Metrics {
  httpRequests: Counter;
  httpDuration: Histogram;
  authEvents: Counter;
  dependencyUp: Gauge;
  dependencyLatency: Gauge;
  render(extra?: () => string[]): string;
  stop(): void;
}

export function createMetrics(): Metrics {
  const httpRequests = new Counter('windle_http_requests_total', 'HTTP requests by method, route and status code.');
  const httpDuration = new Histogram(
    'windle_http_request_duration_seconds',
    'HTTP request latency by method and route.',
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  );
  const authEvents = new Counter('windle_auth_events_total', 'Auth outcomes by event and result.');
  const dependencyUp = new Gauge('windle_dependency_up', '1 if the last readiness probe of the dependency succeeded.');
  const dependencyLatency = new Gauge('windle_dependency_probe_seconds', 'Duration of the last readiness probe.');

  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();

  return {
    httpRequests,
    httpDuration,
    authEvents,
    dependencyUp,
    dependencyLatency,
    render(extra) {
      const mem = process.memoryUsage();
      const process_ = new Gauge('windle_process', 'Process stats (see `stat` label).');
      process_.set({ stat: 'resident_memory_bytes' }, mem.rss);
      process_.set({ stat: 'heap_used_bytes' }, mem.heapUsed);
      process_.set({ stat: 'heap_total_bytes' }, mem.heapTotal);
      process_.set({ stat: 'uptime_seconds' }, Math.round(process.uptime()));
      process_.set({ stat: 'event_loop_delay_p99_seconds' }, loop.percentile(99) / 1e9);
      process_.set({ stat: 'event_loop_delay_max_seconds' }, loop.max / 1e9);
      loop.reset();
      const lines = [
        ...httpRequests.render(),
        ...httpDuration.render(),
        ...authEvents.render(),
        ...dependencyUp.render(),
        ...dependencyLatency.render(),
        ...process_.render(),
        ...(extra?.() ?? []),
      ];
      return `${lines.join('\n')}\n`;
    },
    stop() {
      loop.disable();
    },
  };
}
