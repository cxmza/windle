import type { BlockList } from 'node:net';
import type { Config } from './config.ts';
import type { Metrics } from './lib/metrics.ts';
import type { EphemeralStore, UserRepository } from './store/types.ts';

/** Everything a route needs, passed explicitly (no globals, no fastify decorators for services). */
export interface AppContext {
  config: Config;
  store: EphemeralStore;
  repo: UserRepository;
  metrics: Metrics;
  trust: BlockList;
  now: () => Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Visitor IP resolved through trusted proxies (see lib/client-ip.ts). */
    clientIp: string;
  }
}
