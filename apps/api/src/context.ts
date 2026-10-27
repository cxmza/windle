import type { BlockList } from 'node:net';
import type { Config } from './config.ts';
import type { Metrics } from './lib/metrics.ts';
import type { MarketRepository } from './markets/types.ts';
import type { MediaService } from './media/service.ts';
import type { CacheStore } from './store/cache.ts';
import type { EphemeralStore, UserRepository } from './store/types.ts';
import type { XEnricher } from './x-feed/enrich.ts';
import type { XFeedHub } from './x-feed/hub.ts';

/** Everything a route needs, passed explicitly (no globals, no fastify decorators for services). */
export interface AppContext {
  config: Config;
  store: EphemeralStore;
  repo: UserRepository;
  metrics: Metrics;
  trust: BlockList;
  now: () => Date;
  xFeed: XFeedHub;
  xEnrich: XEnricher;
  markets: MarketRepository;
  cache: CacheStore;
  media: MediaService;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Visitor IP resolved through trusted proxies (see lib/client-ip.ts). */
    clientIp: string;
  }
}
