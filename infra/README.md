# windle infra

Production infrastructure for windle on a single Debian 12 box (2 vCPU, 3.8 GB RAM, 59 GB disk,
`<ORIGIN_IP>`, SSH alias `<SSH_HOST>` → root@…:<SSH_PORT>). **The box is a shared host**:
other, unrelated services run on it. Nothing in this
directory touches those, and nothing you do with it should: no firewall/sshd/networking changes, no
restarts of anything that is not windle.

Everything here is code; the server is a product of `scripts/install.sh`.

## Architecture

```
                        Cloudflare (proxied, orange cloud; SSL mode Full (strict))
                                             │  HTTPS (SNI), CF-Connecting-IP
                                             ▼
┌──────────────────────────────── host nginx 1.22 (:80, :443) ────────────────────────────────┐
│ unknown host :80 → 444 · unknown SNI :443 → TLS handshake rejected                          │
│ :80 windle names → ACME webroot /opt/windle/www-acme, else 301 https (apex → www)           │
│                                                                                             │
│ windle.fun ─────────► 301 https://www.windle.fun$request_uri                                 │
│ www.windle.fun ─────► /opt/windle/current/web   static, 404 for unknown paths              │
│ app.windle.fun ─────► /opt/windle/current/app   SPA fallback                               │
│ oauth.windle.fun ───► /opt/windle/current/auth  SPA fallback, logs without query string    │
│ docs.windle.fun ────► /opt/windle/current/docs  clean URLs (/x → x/index.html | x.html)    │
│ cdn.windle.fun ─────► /opt/windle/current/cdn   assets/fonts/brand + landing               │
│        └─ /img/ ─────► proxy_cache (2 GB disk) ─► 127.0.0.1:8081 imgproxy                   │
│ api.windle.fun ─────► limit_req ─► 127.0.0.1:3001 api (Fastify)   JSON 503 if down          │
│        └─ /v1/x/stream ► unbuffered SSE, limit_conn 8/IP ─► api ─► x-relay (one upstream)   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
        docker compose project `windle` (all ports bound to 127.0.0.1)
        ┌────────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────────────────┐
        │ postgres 17│  │ redis 7   │  │ imgproxy v4  │  │ api (profile "api")      │
        │ 512M  :5432│  │ 256M :6379│  │ 384M  :8081  │  │ 384M :3001               │
        └────────────┘  └───────────┘  └──────────────┘  └──────────────────────────┘
          pgdata vol      redisdata vol   ro: current/ releases/ media/ ┌───────────────────────┐
                                                                     │ x-relay (profile "relay")│
                                                                     │ 64M  :3010  → wss gmgn   │
                                                                     └──────────────────────────┘
          api rw: /opt/windle/media (user image masters, see "Media pipeline")
```

Memory budget (hard `mem_limit`s): 512 + 256 + 384 + 384 + 64 (x-relay) = **1600 MB**, the ~1.6 GB windle
allowance. Raise one limit only by lowering another.

### Server layout

```
/opt/windle/
  infra/            copy of this directory (push-infra.sh); infra.prev = previous copy
  compose/          docker-compose.prod.yml + postgres/initdb + redis/redis.conf (from infra/compose)
  shared/   0700    *.env secrets (0600 root) — never in git; api.env (runtime, DML role) and
                    api-migrate.env (owner/DDL role, read only by the one-off `migrate` service)
  releases/<UTC-ts>/<site>/    immutable static builds (5 kept per site), precompressed .br/.gz
  current/<site> -> ../releases/<ts>/<site>    relative symlinks, flipped atomically (rename(2))
  media/    0755    user image masters <ab>/<sha256>.webp, owner uid 1000 (api rw, imgproxy ro, nginx stat)
  backups/  0700    pg/ redis/ media/ (hard-link mirror) nginx-windle-<ts>.tar
  bin/              installed scripts (backup, deploy-static, imgproxy-url, cf-realip-update, …)
  logs/             cron job logs (logrotate: /etc/logrotate.d/windle); api-releases.log
  www-acme/         ACME HTTP-01 webroot
  incoming/ 0700    upload staging (push-static.sh); api-src-<tag>/ = last 2 api build contexts;
                    x-relay-src-<tag>/ = last 2 relay build contexts
```

Sites: `web`=www, `app`=app, `auth`=oauth, `docs`=docs, `cdn`=cdn.

### Repo layout

| path | what |
|---|---|
| `compose/docker-compose.prod.yml` | postgres / redis / imgproxy / api (profile `api`) / x-relay (profile `relay`) / migrate (profile `migrate`, one-off) |
| `compose/postgres/initdb/10-windle-roles.sh` | creates `windle_owner` (DDL) + `windle_app` (DML only) on first init |
| `compose/redis/redis.conf` | AOF everysec, maxmemory 192mb noeviction |
| `env/*.env.example` | variable names only; real files are generated on the server |
| `nginx/conf.d/windle-http.conf` | log formats, maps, cache path, rate-limit zones, upstreams |
| `nginx/snippets/` | TLS, security headers, per-site CSP, compression, api proxy (+ unbuffered SSE variant), cdn headers |
| `nginx/sites/windle-*.conf` | one file per server block |
| `placeholders/` | "coming online" page rendered for web/app/auth/docs |
| `cdn/` | the cdn release: landing, brand kit SVGs (generated, see below), `samples/aurora.jpg` |
| `scripts/` | install, secrets, deploy (static + api + x-relay), api integration tests, backup, cert, cf-realip, disk-watch, maintenance |
| `scripts/build-brand.mjs` | regenerates `cdn/brand/*.svg` + favicons from `packages/brand` (shape) and `packages/tokens` (colour) |
| `scripts/restore.md` | restore runbook |
| `cron/`, `logrotate/`, `letsencrypt/` | files installed into `/etc` |

## Install / update the server

From a workstation (Git Bash is enough: needs `ssh` and `tar`):

```bash
infra/scripts/push-infra.sh            # copy infra/ to /opt/windle/infra and run install.sh
infra/scripts/push-infra.sh --no-install
```

`install.sh` is idempotent. Per run it: creates the layout; installs `libnginx-mod-http-brotli-{filter,static}`,
`brotli`, `rsync` if missing; generates missing secrets (never overwrites); installs `bin/`; syncs
`compose/`; snapshots then replaces the windle nginx files, runs `nginx -t` (restores the snapshot and
aborts on failure) and reloads; issues the certificate if there is none; refreshes the Cloudflare
real-IP list; `docker compose up -d` and waits for health; deploys placeholders only where a site has no
release yet; installs cron + logrotate. Knobs: `WINDLE_REDEPLOY_CDN=1`, `WINDLE_REDEPLOY_PLACEHOLDERS=1`,
`WINDLE_STOP_BEFORE_CERT=1` (first install: stop once :80 serves ACME).

Shorthand used below (on the server):

```bash
DC="docker compose -p windle -f /opt/windle/compose/docker-compose.prod.yml"
```

## Deploy each app

All commands run from the repo root on a workstation (Git Bash is enough: `ssh` + `tar`; no Docker needed
locally). Every static deploy is a new immutable release with an atomic `current` switch; 5 releases per site are
kept. The production URLs are also the build defaults; the env below only makes them explicit.

```bash
export VITE_API_URL=https://api.windle.fun VITE_APP_URL=https://app.windle.fun \
       VITE_AUTH_URL=https://oauth.windle.fun VITE_DOCS_URL=https://docs.windle.fun
# (unset them before `npm test`: the app suite expects the dev API default)

npm run build -w @windle/web  && infra/scripts/push-static.sh web  apps/web/dist     # www.windle.fun
npm run build -w @windle/app  && infra/scripts/push-static.sh app  apps/app/dist     # app.windle.fun
npm run build -w @windle/auth && infra/scripts/push-static.sh auth apps/auth/dist    # oauth.windle.fun
npm run build -w @windle/docs && infra/scripts/push-static.sh docs apps/docs/dist    # docs.windle.fun

# cdn = infra/cdn (landing + brand kit): regenerate the brand kit, ship infra, deploy the cdn release
npm run brand:cdn && infra/scripts/push-infra.sh --no-install \
  && ssh <SSH_HOST> /opt/windle/bin/deploy-static.sh cdn /opt/windle/infra/cdn

infra/scripts/push-infra.sh            # nginx / compose / scripts / secrets reconcile (idempotent install.sh)
infra/scripts/push-api.sh              # api release (below); optional arg = tag, default UTC timestamp
```

`push-static.sh` streams a tarball over ssh into `/opt/windle/incoming/` and runs
`/opt/windle/bin/deploy-static.sh <site> <dir>`, which refuses a dir without `index.html`, copies into
`releases/<ts>/<site>`, writes `.br`/`.gz` next to text assets (no local pre-compression needed), flips
`current/<site>` atomically and keeps the last 5. For cdn it also runs `render-cdn.sh` (signed demo + brand PNG
URLs). Rollback / inspect (on the server):

```bash
/opt/windle/bin/deploy-static.sh --list app
/opt/windle/bin/deploy-static.sh --rollback app          # web | app | auth | docs | cdn
```

Cache contract the builds must honour: hashed files under `/assets/` (Vite) or `/_astro/` (Astro) are
served `immutable` for a year; everything else `no-cache` (HTML) or 1 h (other files).

**Brand kit**: `infra/cdn/brand/windle-mark-{blue,white,black}.svg`, `windle-app-icon.svg` and both
`favicon.svg` files are generated by `npm run brand:cdn` from `packages/brand/assets/windle-mark.svg` (shape) and
`packages/tokens/src/palette.ts` (`BLUE[500]` = `--accent` #1c69e3, `NEUTRAL.black/white`). `npm run brand:check`
fails on drift; never hand-edit them. The PNGs are rendered on the fly by imgproxy from these SVGs.

### api

Docker is only needed on the server. `push-api.sh` ships the build context — root `package.json`,
`package-lock.json`, `tsconfig.base.json`, every workspace `package.json`, `packages/shared`, `apps/api` (never
`node_modules`, `dist`, `.env*` or the root `key/` folder) — to `/opt/windle/incoming/api-src-<tag>/` and runs
`/opt/windle/bin/deploy-api.sh` there:

1. `docker build -f apps/api/Dockerfile -t windle/api:<tag> --build-arg APP_COMMIT=<tag> .` (context = repo root;
   `apps/api/Dockerfile.dockerignore` filters it again);
2. migrations with the owner role: `WINDLE_API_TAG=<tag> $DC --profile migrate run --rm migrate`
   (env = `api-migrate.env` only; the running api never sees the owner credentials);
3. `docker tag windle/api:<tag> windle/api:current` + `$DC --profile api up -d --no-deps api`;
4. waits for container health + `GET 127.0.0.1:3001/ready` = 200 (90 s); if not ready it switches back to the
   previous tag and exits 1. Every switch is appended to `/opt/windle/logs/api-releases.log`.

```bash
infra/scripts/push-api.sh                                   # release (tag = UTC timestamp)
ssh <SSH_HOST> /opt/windle/bin/deploy-api.sh --list            # images + release log, which tag is current
ssh <SSH_HOST> /opt/windle/bin/deploy-api.sh --rollback        # back to the release before the current one
ssh <SSH_HOST> /opt/windle/bin/deploy-api.sh --rollback <tag>  # or to a specific tag (also rolls forward)
ssh <SSH_HOST> /opt/windle/bin/api-integration-test.sh /opt/windle/incoming/api-src-<tag>
```

Rollback swaps the image only. Migrations are forward-only, so every migration must stay compatible with the
previous release (expand first, contract in a later release).

`api-integration-test.sh` runs `src/integration.test.ts` in a throwaway `node:22-slim` container on the compose
network: scratch database `windle_it_<ts>` (same grants as production: owner migrates, `windle_app` does DML) and
Redis db 15 (must be empty); both are dropped / flushed on exit. Secrets reach the container via a 0600 env file.

Config: `/opt/windle/shared/api.env` sets every production variable explicitly (reference:
`env/api.env.example`, `apps/api/.env.example`): SIWS domain/uri `oauth.windle.fun`, cookie `.windle.fun` +
Secure, exact CORS origins (www/app/oauth/docs), Redis db 0 (sessions, nonces) + db 1 (rate limits),
`METRICS_TOKEN`, `TRUST_PROXY=127.0.0.1,172.16.0.0/12` (the compose network is 172.18.0.0/16 today; nginx
overwrites `X-Forwarded-For` with the real client IP and the api logs that IP). `gen-secrets.sh` creates missing
files and reconciles an older `api.env` (appends missing keys, never changes existing values, moves
`DATABASE_MIGRATION_URL` into `api-migrate.env`).

nginx (`sites/windle-60-api.conf`): `/v1/auth/*` is in the strict `windle_auth` zone (30 r/min, burst 10) except
`/v1/auth/session` and `/v1/auth/providers` (read on every page load, so the general `windle_api` zone);
`/metrics` answers 404 at the edge (scrape on the host: `curl 127.0.0.1:3001/metrics`); `/reference` and
`/openapi.json` are compressed on the fly (scalar.js 4.4 MB to 1.2 MB br). Nothing else on the api is compressed,
on purpose (BREACH). nginx hides the app's HSTS/nosniff/XFO/Referrer/COOP headers (it owns those); the app owns
CSP and CORS — never add CORS in nginx for the api.

### Practice markets, leaderboard, share links

Markets, trades, balances and settlement live in Postgres (`apps/api/drizzle/0001_markets.sql`: `accounts`,
`markets`, `trades`, `positions`, `market_resolutions`; additive, applied by the normal `migrate` step). Points
are practice points with no value: every account starts at 1000 on first use. Amounts are integer micro-points
(bigint), shares and LMSR state float8. Endpoints: `GET/POST /v1/markets`, `GET /v1/markets/:slug`,
`POST /v1/markets/:slug/trades`, `POST /v1/markets/:slug/resolve`, `GET /v1/me/portfolio`, `GET /v1/leaderboard`
(reference: https://api.windle.fun/reference). Resolving settles every position in the same transaction.

- **Who resolves**: the market's creator (YES/VOID any time, NO only after the deadline) and the wallets in
  `ADMIN_WALLETS` (api.env, comma-separated base58; empty = creators only). Creators cannot trade their own
  markets (`403 creator_cannot_trade`), so the leaderboard cannot be farmed by betting and self-resolving.
- **Seed** (once; idempotent, skips existing slugs; DML only, so the api's own env is enough):
  `$DC --profile api run --rm --no-deps api node --enable-source-maps dist/seed.js`. It inserts the 12 OPEN
  sample markets of `apps/app/src/features/predict/fixtures.ts` (copied in `apps/api/src/seed/fixture-markets.ts`)
  with fresh LMSR state at their opening odds, zero volume, no trades, creator = a system user without a wallet
  (`HGu1EJNBc6n8QZHWLqVbn1w6FRZQevcCJ94wkECGbKbM`). Their tweets are invented samples; only admins can resolve them.
- **Share links**: `https://app.windle.fun/s/<slug>` is proxied by nginx (`sites/windle-30-app.conf`,
  `location ^~ /s/`) to `GET /v1/share/m/<slug>`: Open Graph + `twitter:card=summary_large_image` tags, then a meta
  refresh to `/m/<slug>`. The card image is `https://api.windle.fun/v1/og/m/<slug>.png?v=<odds>` (1200x630,
  satori + @resvg/resvg-js, Inter under SIL OFL 1.1 in `apps/api/assets/fonts`), cached in Redis per rounded odds
  (`wl:cache:og:*`, 24 h) and `Cache-Control: public, max-age=3600`. The SPA CSP is unchanged; the share page
  carries the api's own strict CSP. Check after a deploy: `curl -sI https://app.windle.fun/s/<slug>` (200,
  text/html) and paste the link into the X post composer.
- **Image runtime**: the api image is `node:22-alpine` (musl); npm installs `@resvg/resvg-js-linux-x64-musl`
  from the lockfile (no compiler needed). Rendering is ~0.2-0.5 s of CPU per new odds value.

### Market bots

House bots trade open practice markets so prices move between human trades. They are **open, not disguised**:
system users flagged `users.is_bot` (no wallet, cannot sign in), every trade they make is stored with
`trades.bot = true` and returned with `bot: true` and `botName: "Market bot #n"` (`by` is a reserved id
`MarketBot<n>111…`, not a wallet). They are never on the leaderboard and not in a market's `traders`; their share of
`volumePts` / `tradeCount` is `botVolumePts` / `botTradeCount`. Points are practice points: bot balances are topped
up as needed and mean nothing.

- **Model** (`apps/api/src/markets/bots/model.ts`): per market a latent fair value x (log-odds) follows an
  Ornstein–Uhlenbeck process `dx = θ(μ − x)dt + σ dW`, sampled with its exact transition. The anchor μ is the
  people's price: it starts at the market's price, each human trade pulls it toward that trade's post-trade odds by
  an EMA step (`BOTS_ANCHOR_ALPHA`), and between human trades it relaxes the rest of the way
  (`BOTS_ANCHOR_FOLLOW_PER_HOUR`), so bots wobble around where people put the price and never keep fighting it. Each
  tick (`BOTS_TICK_MS`, ±25 % jitter) a few random open markets (`BOTS_MARKETS_PER_TICK`) are advanced and one bot
  trades the LMSR price toward sigmoid(x): at most `BOTS_MAX_STEP_PP` per trade and `BOTS_MAX_STAKE_PTS` per buy,
  nothing inside `BOTS_DEAD_BAND_PP`, selling its own shares first when that moves the price the right way. Bots
  stay within 3..97 %, skip markets whose price people took outside it, and leave a market alone in its last
  `BOTS_QUIET_BEFORE_CLOSE_MINUTES` (at most the last 10 % of its run, so a 15-minute market trades until its final
  90 s) and once it is closed, resolved or voided. Defaults: θ = 2/h, σ = 0.25/√h, about
  ±3 pp around the people's price and ~4 pp hourly moves (simulated: ~550 bot trades/day on a market visited every
  tick; fewer when more markets share the ticks). State per market: `market_bot_state` (migration `0002_bots`).
- **Runtime**: inside the api process, trading through the same locked transaction as a person. Only the instance
  holding the Redis lease `wl:lease:market-bots` (SET NX PX, renewed each tick) trades; a crashed holder's lease
  expires after 3 ticks. Stopping the api finishes the running tick and releases the lease.
- **Enable / disable**: `BOTS_ENABLED=true` (or `false`) in `/opt/windle/shared/api.env`, then recreate the api
  container. Disabling stops new bot trades at once; past bot trades and positions stay (labelled) and settle like
  any other at resolution.

### X feed relay (x-relay)

`services/x-relay` (Go, distroless static image, 64 MB limit) reads gmgn's public X monitor websocket
(`wss://ws.gmgn.ai/v2/ws`, channels `twitter_monitor_basic` + `twitter_monitor_token`), keeps posts whose
author is tagged `kol` or `founder` (`X_RELAY_TAGS`), dedupes them by tweet id (a later, fuller `cp=1` copy is
merged and re-announced only if it adds text/media/quote/reply data), holds the newest 1000 in memory and serves
them on the compose network / `127.0.0.1:3010`: `GET /recent?limit=`, `GET /stream` (SSE: `snapshot` of 50, then
`post` / `delete`, `: ping` every 15 s), `GET /post/{id}`, `GET /health`. Nothing is persisted; a restart starts
with an empty ring. A new post is held `X_RELAY_HOLD_MS` (800) and emitted once, merged with gmgn's copies; then a
relevance gate (`X_RELAY_MODE=signal`, default: every post must carry a crypto signal; `crypto` is looser) hides near-empty posts and
authors over 3 posts / 5 min. Every post carries `signals` (cashtag, ca_sol, ca_evm, link, keyword). `/post/{id}`
also finds held, gated-out and evicted posts (LRU of `X_RELAY_LOOKUP_SIZE`, 5000).

The api (`X_RELAY_URL=http://x-relay:3010` in `api.env`) is the only consumer: `GET /v1/x/recent` proxies
`/recent` (503 `x_feed_unavailable` + `Retry-After: 15` when the relay is down), `GET /v1/x/post/:id` proxies
`/post/{id}` (404 `x_post_not_found`, 503 `x_feed_unavailable`), `GET /v1/x/stream` fans ONE
upstream SSE connection out to every browser, validates every payload against `@windle/shared` (`x-feed.ts`)
and drops invalid ones. If the relay is down, browsers get `200` + a `retry:` hint and EventSource reconnects by
itself. nginx serves `/v1/x/stream` unbuffered (`snippets/windle-proxy-api-sse.conf`, read timeout 120 s,
`limit_conn` 8 per IP); the app CSP allows `pbs.twimg.com` (img/media), `abs`/`ton.twimg.com` (img, enriched
posts) and `video.twimg.com` (media) for hotlinked avatars and media — the relay drops every other media host.

Config: `/opt/windle/shared/x-relay.env` (`env/x-relay.env.example`; created by `gen-secrets.sh`). The relay
needs no secrets; `X_RELAY_PROXY` (optional egress proxy) is never logged.

```bash
infra/scripts/push-infra.sh                                    # once: compose service, x-relay.env, deploy-relay.sh, nginx
infra/scripts/push-relay.sh                                    # build windle/x-relay:<UTC ts>, switch, wait for health
ssh <SSH_HOST> /opt/windle/bin/deploy-relay.sh --list             # images + release log
ssh <SSH_HOST> /opt/windle/bin/deploy-relay.sh --rollback [tag]   # previous (or given) image
ssh <SSH_HOST> /opt/windle/bin/deploy-relay.sh --stop             # switch the feed off (api answers 503 / retry)
ssh <SSH_HOST> 'curl -s 127.0.0.1:3010/health'                    # connected, lastMessageAgeMs, counters
ssh <SSH_HOST> 'curl -s "127.0.0.1:3010/recent?limit=3"'
```

`/health` is liveness and always `200` (a restart cannot fix an upstream outage); `status` is `degraded` when
gmgn is disconnected or silent for 2 min. Logs: one JSON line per connect/disconnect and a `stats` line per minute
(`docker compose -p windle … logs x-relay`). Prometheus (api `/metrics`): `windle_x_feed_live`,
`windle_x_feed_clients`, `windle_x_feed_events_total{event=…}`.

### X post enrichment (twitterapi.io)

`GET /v1/x/post/:id?enrich=1` returns the full post from X (verified type, affiliate badge, media sizes, alt text,
mp4 variants for inline video, metrics, link card, poll, X article, url entities, thread flag) for links a user
pastes or opens — never for the live feed. The api calls `api.twitterapi.io` `GET /twitter/tweets?tweet_ids=<id>`
(~15 credits; plus `GET /twitter/article` ~100 credits for an X article), caches the result in Redis
(`wl:x:enrich:post:<id>`: refetched after 5 min for fresh metrics, kept 24 h and served when X cannot be asked;
"not found" kept 5 min) and merges the relay's copy (`author.tags`, `signals`, `receivedAt`). Spend is counted per
UTC day in `wl:x:enrich:credits:<YYYY-MM-DD>` against `TWITTERAPI_DAILY_BUDGET` (default 50000); past it, or with
Redis down, or without a key, the endpoint answers `503 x_enrich_unavailable` (`Retry-After: 60`). Upstream
lookups are limited per client IP (`X_ENRICH_RATE_LIMIT_PER_MINUTE`, 30). Media URLs are kept only on
`pbs/video/abs/ton.twimg.com` (`video-s.twimg.com` is rewritten to `video.twimg.com`, which serves the same
paths); the app CSP allows these hosts. Prometheus: `windle_x_enrich_total{result=…}`
(hit/miss/not_found/stale/error/budget_exhausted/rate_limited/disabled), `windle_x_enrich_credits_total`.

The key (`TWITTERAPI_IO_KEY`) exists only in `/opt/windle/shared/api.env` (0600 root); it is never committed,
logged or put on a command line. Put it there from the local, git-ignored `key/twitter-key.txt` over ssh stdin,
then recreate the api:

```bash
ssh <SSH_HOST> 'set -eu; f=/opt/windle/shared/api.env; k=$(tr -d " \r\n"); [ -n "$k" ]; umask 077
  grep -v "^TWITTERAPI_IO_KEY=" "$f" > "$f.new" || true; printf "TWITTERAPI_IO_KEY=%s\n" "$k" >> "$f.new"
  chmod 600 "$f.new"; mv "$f.new" "$f"' < key/twitter-key.txt
ssh <SSH_HOST> 'stat -c "%a %U %n" /opt/windle/shared/api.env; grep -c "^TWITTERAPI_IO_KEY=." /opt/windle/shared/api.env'
ssh <SSH_HOST> 'docker compose -p windle -f /opt/windle/compose/docker-compose.prod.yml --profile api up -d --force-recreate api'
```

Rotation: the same with the new key; switching enrichment off: set `TWITTERAPI_IO_KEY=` (empty) and recreate.
Remaining credits: twitterapi.io dashboard (or `GET /oapi/my/info` with the key, never from shared shells).

**Risk — temporary source.** gmgn's websocket is an unofficial, undocumented endpoint used without an agreement
(likely against its terms). It only works because Cloudflare accepts Go's TLS 1.2 hello (Node and TLS 1.3 get
403, observed 2026-09/10); a Cloudflare rule change, a protocol change or a ban of the server IP stops the feed
with no warning, and one IP is all we have (`X_RELAY_PROXY` can route around a ban). Field semantics (`cp`, tags)
are inferred from samples, not specified. Treat it as a stopgap until twitterapi.io Account Monitoring replaces it
(the contract already has `source: 'twitterapi'`; the api and frontend do not change, only the relay's input).

### Images

URL: `https://cdn.windle.fun/img/<signature>/<options>/plain/<source>[@format]`, where `<source>` is relative to
imgproxy's root `/srv/windle` (= `/opt/windle`, `IMGPROXY_BASE_URL=local:///`): `current/cdn/<file>` for the cdn
release, `media/<ab>/<sha256>.webp` for user uploads.

```bash
/opt/windle/bin/imgproxy-url.sh rs:fill:1200:600 current/cdn/samples/aurora.jpg        # auto AVIF/WebP by Accept
/opt/windle/bin/imgproxy-url.sh rs:fit:512:512 current/cdn/brand/windle-mark-blue.svg png
```

Signature = base64url(HMAC-SHA256(key, salt ‖ path-after-signature)) with hex key/salt from
`imgproxy.env` (same values are in `api.env` so the api can mint URLs). Sources are restricted to local
files (`IMGPROXY_ALLOWED_SOURCES=local://`), so imgproxy cannot fetch the internet.
Cache layers: browser (1 y, `Vary: Accept`) → Cloudflare (pinned formats only, see below) → nginx disk
cache (2 GB, 30 d idle, key = format bucket + URI, `X-Cache-Status`) → imgproxy (2 workers, queue 32,
40 MP / 25 MB source limit, 4096 px output limit).

### Media pipeline (user images)

Market/token images and avatars. Code: `apps/api/src/media/`, routes `apps/api/src/routes/media.ts`, contracts
`packages/shared/src/media.ts`, tables `media`, `media_uploads`, `media_reports` + `markets.image_id`,
`users.avatar_media_id` (`apps/api/drizzle/0004_media.sql`, additive).

```
browser ── POST api.windle.fun/v1/media  (raw body, Content-Type image/jpeg|png|webp, ≤ 10 MB)
   │        nginx: location = /v1/media, client_max_body_size 10m, limit_req windle_upload 10 r/min/IP, body buffered
   ▼
api  session + CSRF Origin → per-user limits (6/min, 40/24 h) → storage cap (15 GB → 507)
   │  magic bytes must match Content-Type → sharp (limitInputPixels 40 MP, failOn error, first frame only)
   │  → EXIF rotate → strip ALL metadata (ICC converted to sRGB) → long edge ≤ 2048
   │  → WebP q85 (lossless for PNG with alpha ≤ 512×512) → id = sha256(master), ThumbHash from ≤ 100 px
   │  1 image at a time (MEDIA_MAX_CONCURRENT), 16 may wait, beyond that 503 media_busy
   ▼
/opt/windle/media/<id[0:2]>/<id>.webp   (tmp + fsync + rename, 0644; same bytes → same id → one file, one row)
   ▲ ro                                         ▲ stat
imgproxy (local:///media/...)  ◄── nginx /img/ cache ◄── Cloudflare ◄── browser
```

Delivery: DTOs carry `ApiImage { id, width, height, thumbhash, urls }` with signed URLs per preset —
`avatar64`/`avatar128` (square fill + smart crop), `thumb` (160 square), `card` (fit 480), `cover` (fit 1200),
`og` (1200×630 JPEG). Where: `market.image` (list, detail, create, trade), `me.avatar` (`GET /v1/me`, sign-in
response), `trade.avatar`, leaderboard `entries[].avatar` / `me.avatar`. URLs are content-addressed, so they never
change: imgproxy sends `Cache-Control: max-age=31536000` (IMGPROXY_TTL) through every layer.

Format: `MEDIA_URL_FORMAT=webp` (default) pins `@webp` (og: `@jpg`) into the URLs, because Cloudflare does not vary
on `Accept` on our plan: pinned URLs are the ones it caches at the edge, which is what makes images fast worldwide.
`auto` drops the suffix so nginx/imgproxy negotiate AVIF/WebP/JPEG per browser (~20–30 % smaller AVIF), but then
Cloudflare must not cache them (`Cloudflare-CDN-Cache-Control: no-store`, see `conf.d/windle-http.conf`) and every
view comes from the origin's disk cache. Switching mode changes URLs; old ones keep working.

Moderation: uploads need a session and count against the daily quota; `POST /v1/media/:id/report { reason, note? }`
(one per user per image, 20/h); admins (`ADMIN_WALLETS`) list reports at `GET /v1/admin/media/reports` and take an
image down with `DELETE /v1/admin/media/:id`:

1. row → `removed` (kept, so the same bytes are refused with `410 media_removed` forever), avatars and
   `markets.image_id` cleared → every DTO shows `null` at once;
2. the master is deleted; `sites/windle-70-cdn.conf` stats `/opt/windle/media/<ab>/<id>.webp` before serving any
   `/img/…/plain/media/…` URL, so all sizes answer 404 immediately — including variants still in the nginx cache
   (open-source nginx cannot purge by key; those entries are unreachable and age out after 30 d idle);
3. Cloudflare: with `CF_ZONE_ID` + `CF_API_TOKEN` (token permission *Zone → Cache Purge*) the api purges every preset
   URL (both formats) and the current share image of each market using it (`/v1/og/m/<slug>.png?v=…`; cards that
   show a user image are sent with `max-age=300`, so older odds variants leave Cloudflare within 5 min); the response says
   `cdnPurged: purged | not_configured | failed`. Without a token, or on failure, the api logs the URL list
   (`"msg":"media removed; Cloudflare purge …"`): purge them in Dashboard → Caching → Configuration → Purge Cache →
   Custom Purge → URL. Browsers that already hold an image keep it (1-year cache) — nothing can reach those.
4. Backups: `backups/media/` still links the master until the next nightly `backup.sh` (`rsync --delete`). For
   illegal content delete it now: `rm /opt/windle/backups/media/<ab>/<id>.webp`.

Rollout (first time; later api releases are the usual `push-api.sh`):

1. `infra/scripts/push-infra.sh --no-install && ssh <SSH_HOST> 'WINDLE_REDEPLOY_CDN=1 bash /opt/windle/infra/scripts/install.sh'`
   — creates `/opt/windle/media` (uid 1000), appends `IMGPROXY_KEY`/`IMGPROXY_SALT` to an older `api.env`, installs
   nginx (new `windle_upload` zone, `/v1/media` location, `/img/` stat gate; `nginx -t` or rollback), recreates
   imgproxy with `IMGPROXY_BASE_URL=local:///` + the media mount, and re-renders the cdn landing (its sample URLs now
   start with `current/cdn/`; until then they 404).
2. `infra/scripts/push-api.sh` — builds the image (the build loads sharp once: a missing musl binary fails here),
   applies `0004_media.sql`, switches the api (compose already gives it `MEDIA_ROOT` + the rw mount).
3. Check: `curl -s -o /dev/null -w '%{http_code}
' -X POST https://api.windle.fun/v1/media` → 401; upload one image
   from the app; its `urls.thumb` → 200 `image/webp`, twice → `cf-cache-status: HIT`.
4. Owner: CSAM Scanning Tool on; optionally a purge token (`CF_ZONE_ID`/`CF_API_TOKEN` in `api.env`, recreate api).

**Cloudflare CSAM Scanning Tool** (free, owner action): Dashboard → Caching → Configuration → CSAM Scanning Tool →
enable it and set the notification email. Per Cloudflare's description it fuzzy-hashes images served through the zone
against known-CSAM hash lists, blocks matching URLs and notifies that email (not verified here). Act on a notice
with the takedown above: the URL contains the media id (`…/plain/media/<ab>/<id>.webp…`). It only sees images that
pass through Cloudflare (after the first view of a URL) and only known material; it does not replace reports.
Reporting duties depend on jurisdiction and are not covered here.

Ops: metrics `windle_media_uploads_total{result}`, `windle_media_bytes_total{stage}`,
`windle_media_rejects_total{reason}` (type_mismatch, invalid, too_many_pixels, removed, storage_full, busy, quota),
`windle_media_removals_total{purge}`, `windle_media_processing_seconds`. Disk: `du -sh /opt/windle/media`; the cap
is `MEDIA_MAX_TOTAL_BYTES` (sum of active masters). Moving to R2 later: copy the tree under the same keys
(`media/<ab>/<id>.webp`); imgproxy reads S3-compatible storage (`IMGPROXY_USE_S3`), so the signed source path and
therefore every URL can stay as is. The nginx stat gate and the cdn-release sources would need rework then (not done).

## Cloudflare settings (expected; verify in the dashboard)

| setting | value | why |
|---|---|---|
| SSL/TLS mode | **Full (strict)** | origin has a valid Let's Encrypt cert for all 7 names. Flexible would loop (origin redirects :80 → https). Observed 2026-10-11: CF already connects on :443 (525 before the cert existed), so the mode is Full or Full (strict) — dashboard needed to tell which. |
| Always Use HTTPS | on (recommended) | origin also redirects, but this saves a hop. Observed: `http://windle.fun/` was answered by the origin's redirect, i.e. it looks **off** now. ACME renewal keeps working either way (see `scripts/issue-cert.sh`). |
| Minimum TLS | 1.2 | matches origin |
| HSTS at Cloudflare | off | the origin sends `Strict-Transport-Security: max-age=31536000` (no includeSubDomains/preload, on purpose) |
| Cache rule `cdn.windle.fun/img/*` | **Eligible for cache**, respect origin TTL | without it CF never caches transforms (URLs end in `.jpg@webp`, not a cacheable extension → `cf-cache-status: DYNAMIC` observed). Auto-format URLs carry `Cloudflare-CDN-Cache-Control: no-store` so CF does not cache them (CF ignores `Vary: Accept` outside Enterprise); pinned-format URLs get cached. **Verify after creating the rule**: auto URL → `BYPASS`, pinned URL → `MISS` then `HIT`. |
| Cache rule `cdn.windle.fun/assets/*`, `/fonts/*` | Eligible for cache, respect origin | immutable 1-year assets |
| CSAM Scanning Tool | **on** + notification email (owner action) | user uploads; see "Media pipeline" |
| API token for purge | optional: `CF_ZONE_ID` + `CF_API_TOKEN` (Zone → Cache Purge) in `api.env` | takedown purges by URL |
| Polish / Mirage / Rocket Loader / Email obfuscation | off | they rewrite responses (break CSP / double-optimise images) |
| Authenticated Origin Pulls | optional TODO | origin currently accepts TLS from anyone presenting one of our SNI names |

## Rotate secrets

All secrets: `/opt/windle/shared/*.env` (0600 root). Never print them; edit with `$EDITOR` on the server.

- **Postgres role password** (`windle_app` or `windle_owner`):
  ```bash
  NEW=$(openssl rand -hex 32)
  $DC exec -T postgres psql -U postgres -c "ALTER ROLE windle_app PASSWORD '$NEW'"
  # update WINDLE_APP_PASSWORD in postgres.env and the DATABASE_URL in api.env, then
  $DC --profile api up -d --force-recreate api
  ```
  `POSTGRES_PASSWORD` in `postgres.env` is only read at first init; rotate the superuser the same way
  (`ALTER ROLE postgres …`) and update the file for the record.
- **Redis**: set `REDIS_PASSWORD` in `redis.env` and the `REDIS_*_URL`s in `api.env`, then
  `$DC up -d --force-recreate redis && $DC --profile api up -d --force-recreate api` (sessions persist in AOF).
- **imgproxy key/salt** (invalidates every signed URL unless done in two steps): put `new,old` in both
  `IMGPROXY_KEY` and `IMGPROXY_SALT` (imgproxy accepts comma-separated pairs), recreate imgproxy, switch the
  signers (api.env, `imgproxy-url.sh` uses the first pair), redeploy cdn, later drop `old`.
- **COOKIE_SECRET**: replace in `api.env`, recreate api (unused today: sessions are opaque Redis tokens).
- **METRICS_TOKEN**: replace in `api.env`, `$DC --profile api up -d --force-recreate api`.
- **TWITTERAPI_IO_KEY**: see "X post enrichment" (key over ssh stdin, recreate api).
- **Owner role** (`windle_owner`): `ALTER ROLE` as above, update `WINDLE_OWNER_PASSWORD` in `postgres.env` and
  `DATABASE_MIGRATION_URL` in `api-migrate.env` (the api itself does not use it).
- To regenerate a file from scratch: move it away and run `/opt/windle/bin/gen-secrets.sh` — only for
  files whose consumers you will also update (never `postgres.env` alone after init).

## Backups and restore

- `/etc/cron.d/windle-backup` → `/opt/windle/bin/backup.sh` daily 03:41 UTC, log `/opt/windle/logs/backup.log`.
- Postgres: `pg_dump -Fc` (verified with `pg_restore --list`) + `pg_dumpall --globals-only`; Redis: `BGSAVE`
  then copy `dump.rdb` (verified: bgsave status ok + `REDIS` magic). Newest 14 of each kept.
- User image masters: `backups/media/` = `rsync -a --delete --link-dest` mirror of `/opt/windle/media` (hard links:
  no extra disk on the same filesystem; protects against deletion, not disk loss; taken-down files leave it on the
  next run).
- Restore procedures: [`scripts/restore.md`](scripts/restore.md) (also installed at `/opt/windle/bin/restore.md`).
- **TODO — offsite backups**: today backups sit on the same disk as the data. Needs a target from the owner
  (S3-compatible bucket, another host via restic/borg, …). Then add an encrypted push step at the end of
  `backup.sh`.

## Scheduled jobs (`/etc/cron.d/windle-*`, all UTC; :17 hourly belongs to another tenant)

| file | when | what |
|---|---|---|
| windle-backup | 03:41 daily | backup.sh |
| windle-cf-realip | 04:52 Mon | refresh Cloudflare ranges in `/etc/nginx/snippets/cloudflare-realip.conf` (global, included by nginx.conf); reload only if changed and `nginx -t` passes |
| windle-disk-watch | :07 hourly | one-line disk report, syslog warning ≥ 80 % (no actions) |
| windle-maintenance | 05:33 Sun | prune unused images labelled `fun.windle.project=windle` older than 14 d |
| certbot.timer (system) | twice daily | renew; deploy hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` = `nginx -t -q && systemctl reload nginx` |

## Logs

- nginx: `/var/log/nginx/windle-<site>.access.log` — one JSON object per line (`windle_json`; oauth uses
  `windle_json_noquery`). Rotated by the stock nginx logrotate.
- containers: json-file, 10 MB × 3 per container. `$DC logs -f imgproxy`.
- jobs: `/opt/windle/logs/*.log`.

## Security notes

- Every windle port is bound to 127.0.0.1; only nginx is public. UFW (pre-existing) allows 80/443 tcp.
- Headers (all sites): HSTS 1 y, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP
  same-origin; CORP same-site (cdn: cross-origin); per-site CSP in `nginx/snippets/windle-csp-*.conf`.
  docs allows inline scripts (Starlight); www/app/oauth allow `'wasm-unsafe-eval'` and `style-src 'unsafe-inline'`.
- Postgres: `windle_app` = CONNECT + DML on objects `windle_owner` creates; no DDL, no TRUNCATE, no access to
  the `postgres`/`template1` databases. SCRAM for all TCP clients; the image's `trust` for 127.0.0.1 applies
  only inside the container.
- Redis: password required (`NOAUTH` otherwise); `noeviction`, so a full Redis fails writes loudly instead of
  silently dropping sessions.

## Known TODOs

1. **Offsite backups** — target needed (see above).
2. **api** — live since 2026-10-11 (`deploy-api.sh --list`). While it is down nginx answers
   `503 {"error":{"code":"service_unavailable",…}}` with `Retry-After: 30`.
3. **Cloudflare cache rules for cdn** and confirmation of SSL mode / Always Use HTTPS (table above).
4. imgproxy v4 sends the same `ETag` for all format variants of one source (observed); harmless for
   browsers (cache is per URL + Vary) but not strictly correct. Revisit if a CDN in front starts serving
   wrong variants on revalidation.
5. Redis logs the `vm.overcommit_memory` warning; setting the host sysctl was not done because the host
   is shared with other services. Dataset is tiny, BGSAVE works today.
6. Orphaned anonymous docker volumes from the previous project exist on the host; not windle's, left alone.
7. CSP tightening for docs (hashes instead of `'unsafe-inline'`) once the Starlight build is final.
8. `font-src` allows `data:` on www/app/oauth/docs because Vite/Astro inline `@fontsource` subsets < 4 KB.
   Alternative if wanted: exclude `.woff2` from `build.assetsInlineLimit` and drop `data:` again.
9. `node:22-slim` stays cached on the host for `api-integration-test.sh` (not windle-labelled, so the weekly
   prune leaves it; `docker rmi node:22-slim` if disk matters).
10. **X feed** — `x-relay` reads an unofficial gmgn endpoint (see "X feed relay"); replace with twitterapi.io
    Account Monitoring.
