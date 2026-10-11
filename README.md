<a href="https://www.windle.fun">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner.svg">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/banner-light.svg">
    <img alt="windle — Ship or slash. Onchain promises with collateral on Solana." src=".github/assets/banner.svg" width="100%">
  </picture>
</a>

<div align="center">

[![CI](https://github.com/cxmza/windle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cxmza/windle/actions/workflows/ci.yml)
[![CodeQL](https://github.com/cxmza/windle/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/cxmza/windle/actions/workflows/codeql.yml)

[**Website**](https://www.windle.fun) · [**App**](https://app.windle.fun) · [**Docs**](https://docs.windle.fun) · [**API**](https://api.windle.fun) · [**How it works**](https://docs.windle.fun/how-it-works/)

</div>

---

## What is windle

**windle puts promises on the line.** A team states something a program can check on Solana — *"our program is
deployed and executable at this address before Dec 1"* — and locks collateral behind it. A YES/NO market prices the
odds. At the deadline nobody votes: the program reads the chain and pays out. **Ship**, and the team gets its
collateral back while YES is paid. **Slash**, and the collateral goes to NO holders.

```mermaid
flowchart LR
    team(["Team"]) -- "checkable claim + deadline" --> promise["Promise"]
    team -- "locks" --> collateral[("Collateral<br/>program-owned")]
    traders(["Traders"]) -- "buy YES / NO" --> market{{"YES / NO market<br/>price = odds"}}
    promise --> market
    market --> verdict{"Deadline<br/>the chain decides"}
    collateral --> verdict
    verdict -- "condition met" --> ship["SHIP<br/>collateral back · YES paid"]
    verdict -- "condition missed" --> slash["SLASH<br/>collateral to NO holders"]
```

| | |
|---|---|
| **Promise** | A condition over onchain accounts plus a deadline. A tweet saying "mainnet soon" is not a promise; a condition a program can evaluate is. |
| **Collateral** | Locked in a program-controlled account. Neither the team nor windle can withdraw it before resolution. The amount is public. |
| **Market** | Buy YES if you believe the team ships, NO if you don't. The YES price, between 0 and 1, reads as the probability. |
| **Verdict** | After the deadline anyone can trigger resolution; the program checks the condition against chain state. No vote, no dispute window. |

Read the full design in the docs: [How it works](https://docs.windle.fun/how-it-works/) ·
[Collateral](https://docs.windle.fun/concepts/collateral/) · [Market](https://docs.windle.fun/concepts/market/) ·
[Resolution](https://docs.windle.fun/concepts/resolution/) · [Payouts](https://docs.windle.fun/concepts/payouts/).

> [!IMPORTANT]
> windle is **pre-launch**. The protocol programs are not deployed; markets, prices and positions on the website are
> illustrative demo data, and no real funds are involved anywhere. What is live today: the website, sign-in with a
> Solana wallet, the account API and the docs.

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="https://www.windle.fun"><img src=".github/assets/screen-landing.webp" alt="Landing page: SHIP OR SLASH. hero over a blue nebula"></a><p align="center"><sub><b>Landing</b> — www.windle.fun</sub></p></td>
    <td width="50%"><a href="https://www.windle.fun"><img src=".github/assets/screen-market.webp" alt="Market chapter: a demo YES/NO market card next to 3D collateral stacks"></a><p align="center"><sub><b>The market prices the truth</b> — demo market, no real funds</sub></p></td>
  </tr>
  <tr>
    <td width="50%"><a href="https://oauth.windle.fun"><img src=".github/assets/screen-signin.webp" alt="Sign-in page: 3D glass mark, KEEP YOUR WORD., wallet list"></a><p align="center"><sub><b>Sign in with Solana</b> — oauth.windle.fun</sub></p></td>
    <td width="50%"><a href="https://api.windle.fun"><img src=".github/assets/screen-api.webp" alt="API portal: live status, base URL, reference and OpenAPI links"></a><p align="center"><sub><b>API portal</b> — api.windle.fun</sub></p></td>
  </tr>
</table>

<details>
<summary><b>Docs</b> — docs.windle.fun</summary>
<br>
<a href="https://docs.windle.fun"><img src=".github/assets/screen-docs.webp" alt="Docs home: SHIP OR SLASH. with the windle mark"></a>
</details>

## Live

| Surface | URL | What runs there |
|---|---|---|
| Website | [www.windle.fun](https://www.windle.fun) | Landing — Vite + React 19 + React Three Fiber, GSAP and Motion |
| App | [app.windle.fun](https://app.windle.fun) | Product app — React 19, React Router 7, TanStack Query |
| Sign-in | [oauth.windle.fun](https://oauth.windle.fun) | Sign-In With Solana via Wallet Standard |
| Docs | [docs.windle.fun](https://docs.windle.fun) | Astro Starlight — concepts, guides, API, legal |
| API | [api.windle.fun](https://api.windle.fun) | Fastify 5 — sessions and accounts; [reference](https://api.windle.fun/reference/) · [OpenAPI 3.1](https://api.windle.fun/openapi.json) |
| CDN | [cdn.windle.fun](https://cdn.windle.fun) | Brand assets, fonts, image resizing (imgproxy) |

## Architecture

npm-workspaces monorepo: every surface, the API, the shared packages and the server setup live and ship together.

```
windle/
├─ apps/
│  ├─ web/        landing             Vite · React 19 · R3F · GSAP · Motion · Tailwind 4
│  ├─ app/        product app         Vite · React 19 · React Router 7 · TanStack Query
│  ├─ auth/       sign-in             Wallet Standard · Sign-In With Solana · R3F
│  ├─ docs/       documentation       Astro · Starlight
│  └─ api/        backend             Fastify 5 · zod · Drizzle · Postgres 17 · Redis 7
├─ packages/
│  ├─ tokens/     design tokens       Tailwind 4 @theme (OKLCH) + sRGB mirrors for three.js
│  ├─ brand/      WindleMark          React component, mark SVG, favicon source
│  └─ shared/     API contracts       zod schemas + TS types (SIWS, session, me)
└─ infra/         production          docker compose, nginx, CDN, deploy / backup scripts, runbook
```

| Path | Deploys to | Notes |
|---|---|---|
| `apps/web` | www.windle.fun | static, immutable releases with atomic switch |
| `apps/app` | app.windle.fun | static SPA |
| `apps/auth` | oauth.windle.fun | static SPA |
| `apps/docs` | docs.windle.fun | static |
| `apps/api` | api.windle.fun | container on loopback behind nginx, health-gated switch |
| `packages/*` | — | source-only TypeScript (`exports` → `src/*.ts`); Vite, Vitest and tsx compile them in place, esbuild inlines them into the API |
| `infra` | the server | see [`infra/README.md`](infra/README.md) and [`DEPLOY.md`](DEPLOY.md) |

```mermaid
flowchart LR
    user(("Browser")) --> cf["Cloudflare"]
    cf --> nginx["nginx<br/>TLS · CSP · rate limits"]
    nginx --> static["www · app · oauth · docs<br/>static releases"]
    nginx --> cdn["cdn<br/>brand · fonts"]
    cdn --> img["imgproxy"]
    nginx --> api["api<br/>Fastify 5"]
    api --> pg[("Postgres 17")]
    api --> redis[("Redis 7<br/>sessions · nonces")]
```

<details>
<summary><b>Sign-In With Solana</b> — how a session is created</summary>
<br>

```mermaid
sequenceDiagram
    autonumber
    participant W as Wallet
    participant A as oauth.windle.fun
    participant API as api.windle.fun
    A->>API: GET /v1/auth/siws/nonce
    API-->>A: single-use sign-in input
    A->>W: solana:signIn(input)
    W-->>A: signed message + signature
    A->>API: POST /v1/auth/siws/verify
    API-->>A: 200 + HttpOnly session cookie (Domain=.windle.fun)
    A->>API: GET /v1/me (credentials: include)
```

Signing a message cannot move funds. There are no API keys: browser clients call with `credentials: "include"`,
credentialed CORS is limited to an exact-origin allow-list, and every non-2xx body is
`{ "error": { "code", "message", "requestId" } }`. Details: [API docs](https://docs.windle.fun/api/overview/).

</details>

## Run it locally

Requirements: **Node.js ≥ 22.12** and npm 10. The frontends and all unit tests need nothing else (API tests use an
in-memory store). Running the API itself (`dev:api`) needs a local Postgres 17 and Redis 7 — by default
`postgres://windle:windle@127.0.0.1:5432/windle` and `redis://127.0.0.1:6379/0`; override with `DATABASE_URL` and
`REDIS_URL` (see `apps/api/.env.example`).

```bash
git clone https://github.com/cxmza/windle.git
cd windle
npm ci                 # one lockfile for every workspace
```

| Command | What |
|---|---|
| `npm run dev:web` | landing on `:5173` |
| `npm run dev:app` | product app on `:5174` |
| `npm run dev:auth` | sign-in on `:5175` |
| `npm run dev:docs` | docs on `:4321` |
| `npm run dev:api` | API on `:3001` (tsx watch) |
| `npm run lint` | Biome over the whole repo (`lint:fix` applies safe fixes) |
| `npm run typecheck` | every workspace (`tsc` / `astro sync && tsc`) |
| `npm test` | Vitest in every workspace that has tests |
| `npm run build` | every workspace → `<workspace>/dist` |
| `npm run e2e` | Playwright for `apps/web` |

One workspace: `npm run <script> -w @windle/<name>`. Add a dependency: `npm install <pkg> -w @windle/<name>`.
Frontends read `VITE_API_URL`, `VITE_APP_URL`, `VITE_AUTH_URL`, `VITE_DOCS_URL` and default to the local ports above
in development.

<details>
<summary><b>Using the shared packages</b></summary>
<br>

- **Tokens in a Tailwind app** — in the app's CSS entry, after `@import "tailwindcss";`, add
  `@import "@windle/tokens/fonts.css";`, `@import "@windle/tokens/tokens.css";` and
  `@source "<relative path>/packages/brand/src";` so classes used inside shared components are generated.
- **Palette for three.js / canvas** — `import { BLUE, SCENE_BLUE } from '@windle/tokens';`
- **Brand** — `import { WindleMark, WINDLE_MARK_PATH } from '@windle/brand';`; SVG files:
  `@windle/brand/favicon.svg`, `@windle/brand/windle-mark.svg`.
- **Contracts** — `import { SiwsNonce, SiwsVerifyRequest, Session, Me, safeReturnTo } from '@windle/shared';`
- Inside packages, relative imports carry the `.ts` extension (`./auth.ts`); every tsconfig extends
  `tsconfig.base.json`, which allows it.

</details>

## Project status

| Area | State |
|---|---|
| Website, docs, brand | live |
| Sign-In With Solana, sessions, account API | live (`v0.1`) |
| Product app | early shell |
| Protocol programs (promises, collateral, markets, resolution) | design stage — see [docs](https://docs.windle.fun/how-it-works/) |
| Email / X / Google sign-in | planned, disabled until real credentials exist |

Releases and notes: [Releases](https://github.com/cxmza/windle/releases). Questions and ideas:
[Discussions](https://github.com/cxmza/windle/discussions).

## Security

Please **do not open public issues for vulnerabilities**. Report them privately through
[GitHub private vulnerability reporting](https://github.com/cxmza/windle/security/advisories/new) — see
[SECURITY.md](SECURITY.md). Secrets never live in this repository; server-only values are generated on the server.

## License

**Source-available, all rights reserved.** The code is public so it can be read, reviewed and learned from; it is not
open source, and no right to use, copy, modify or redistribute it is granted. See [LICENSE](LICENSE). The owner may
switch to an open-source license later.

> [!NOTE]
> Nothing on windle is financial advice. Prediction markets may be restricted where you live; read the
> [risk notice](https://docs.windle.fun/legal/risk/) and [terms](https://docs.windle.fun/legal/terms/).

