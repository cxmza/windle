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
└─────────────────────────────────────────────────────────────────────────────────────────────┘
        docker compose project `windle` (all ports bound to 127.0.0.1)
        ┌────────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────────────────┐
        │ postgres 17│  │ redis 7   │  │ imgproxy v4  │  │ api (profile "api")      │
        │ 512M  :5432│  │ 256M :6379│  │ 384M  :8081  │  │ 384M :3001               │
        └────────────┘  └───────────┘  └──────────────┘  └──────────────────────────┘
          pgdata vol      redisdata vol   ro: current/ + releases/
```

Memory budget (hard `mem_limit`s): 512 + 256 + 384 + 384 = **1536 MB**, under the ~1.6 GB windle
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
  backups/  0700    pg/ redis/ nginx-windle-<ts>.tar
  bin/              installed scripts (backup, deploy-static, imgproxy-url, cf-realip-update, …)
  logs/             cron job logs (logrotate: /etc/logrotate.d/windle); api-releases.log
  www-acme/         ACME HTTP-01 webroot
  incoming/ 0700    upload staging (push-static.sh); api-src-<tag>/ = last 2 api build contexts
```

Sites: `web`=www, `app`=app, `auth`=oauth, `docs`=docs, `cdn`=cdn.

### Repo layout

| path | what |
|---|---|
| `compose/docker-compose.prod.yml` | postgres / redis / imgproxy / api (profile `api`) / migrate (profile `migrate`, one-off) |
| `compose/postgres/initdb/10-windle-roles.sh` | creates `windle_owner` (DDL) + `windle_app` (DML only) on first init |
| `compose/redis/redis.conf` | AOF everysec, maxmemory 192mb noeviction |
| `env/*.env.example` | variable names only; real files are generated on the server |
| `nginx/conf.d/windle-http.conf` | log formats, maps, cache path, rate-limit zones, upstreams |
| `nginx/snippets/` | TLS, security headers, per-site CSP, compression, api proxy, cdn headers |
| `nginx/sites/windle-*.conf` | one file per server block |
| `placeholders/` | "coming online" page rendered for web/app/auth/docs |
| `cdn/` | the cdn release: landing, brand kit SVGs (generated, see below), `samples/aurora.jpg` |
| `scripts/` | install, secrets, deploy (static + api), api integration tests, backup, cert, cf-realip, disk-watch, maintenance |
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

### Images

URL: `https://cdn.windle.fun/img/<signature>/<options>/plain/<path-in-cdn-release>[@format]`.

```bash
/opt/windle/bin/imgproxy-url.sh rs:fill:1200:600 samples/aurora.jpg        # auto AVIF/WebP by Accept
/opt/windle/bin/imgproxy-url.sh rs:fit:512:512 brand/windle-mark-blue.svg png
```

Signature = base64url(HMAC-SHA256(key, salt ‖ path-after-signature)) with hex key/salt from
`imgproxy.env` (same values are in `api.env` so the api can mint URLs). Sources are restricted to local
files of the live cdn release (`IMGPROXY_ALLOWED_SOURCES=local://`), so imgproxy cannot fetch the internet.
Cache layers: browser (1 y, `Vary: Accept`) → Cloudflare (pinned formats only, see below) → nginx disk
cache (2 GB, 30 d idle, key = format bucket + URI, `X-Cache-Status`) → imgproxy (2 workers, queue 32,
40 MP / 25 MB source limit, 4096 px output limit).

## Cloudflare settings (expected; verify in the dashboard)

| setting | value | why |
|---|---|---|
| SSL/TLS mode | **Full (strict)** | origin has a valid Let's Encrypt cert for all 7 names. Flexible would loop (origin redirects :80 → https). Observed 2026-10-11: CF already connects on :443 (525 before the cert existed), so the mode is Full or Full (strict) — dashboard needed to tell which. |
| Always Use HTTPS | on (recommended) | origin also redirects, but this saves a hop. Observed: `http://windle.fun/` was answered by the origin's redirect, i.e. it looks **off** now. ACME renewal keeps working either way (see `scripts/issue-cert.sh`). |
| Minimum TLS | 1.2 | matches origin |
| HSTS at Cloudflare | off | the origin sends `Strict-Transport-Security: max-age=31536000` (no includeSubDomains/preload, on purpose) |
| Cache rule `cdn.windle.fun/img/*` | **Eligible for cache**, respect origin TTL | without it CF never caches transforms (URLs end in `.jpg@webp`, not a cacheable extension → `cf-cache-status: DYNAMIC` observed). Auto-format URLs carry `Cloudflare-CDN-Cache-Control: no-store` so CF does not cache them (CF ignores `Vary: Accept` outside Enterprise); pinned-format URLs get cached. **Verify after creating the rule**: auto URL → `BYPASS`, pinned URL → `MISS` then `HIT`. |
| Cache rule `cdn.windle.fun/assets/*`, `/fonts/*` | Eligible for cache, respect origin | immutable 1-year assets |
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
- **Owner role** (`windle_owner`): `ALTER ROLE` as above, update `WINDLE_OWNER_PASSWORD` in `postgres.env` and
  `DATABASE_MIGRATION_URL` in `api-migrate.env` (the api itself does not use it).
- To regenerate a file from scratch: move it away and run `/opt/windle/bin/gen-secrets.sh` — only for
  files whose consumers you will also update (never `postgres.env` alone after init).

## Backups and restore

- `/etc/cron.d/windle-backup` → `/opt/windle/bin/backup.sh` daily 03:41 UTC, log `/opt/windle/logs/backup.log`.
- Postgres: `pg_dump -Fc` (verified with `pg_restore --list`) + `pg_dumpall --globals-only`; Redis: `BGSAVE`
  then copy `dump.rdb` (verified: bgsave status ok + `REDIS` magic). Newest 14 of each kept.
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
