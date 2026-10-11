# Contributing to windle

Thanks for taking the time to look at windle. This repository is **source-available** (see [LICENSE](LICENSE)):
issues, discussions and pull requests are welcome, and by contributing you agree to the contribution terms in the
license.

## Before you start

- **Questions, ideas, design feedback** → [Discussions](https://github.com/cxmza/windle/discussions).
- **Bugs** → [open an issue](https://github.com/cxmza/windle/issues/new/choose) with the bug form.
- **Security issues** → never in public; follow [SECURITY.md](SECURITY.md).
- For anything larger than a small fix, open an issue or discussion first so we can agree on the approach.

## Development setup

Requirements: Node.js ≥ 22.12 and npm 10.

```bash
npm ci
npm run dev:web      # or dev:app / dev:auth / dev:docs / dev:api
```

See the [README](README.md#run-it-locally) for every script and the workspace layout.

## Checks

CI runs these on every pull request; run them locally first:

```bash
npm run lint         # Biome (npm run lint:fix applies safe fixes)
npm run typecheck
npm test
npm run build
```

## Conventions

- **TypeScript** — strict, no `any`. Shared contracts live in `packages/shared` (zod schemas + types).
- **Styling** — design tokens from `packages/tokens` over magic values; Tailwind 4 with the `@theme` tokens.
- **Motion** — every animation respects `prefers-reduced-motion`.
- **Formatting and lint** — Biome; don't hand-format, run `npm run lint:fix`.
- **Tests** — Vitest next to the code (`*.test.ts[x]`); behaviour over implementation details.
- **Commits** — small and focused, imperative subject (`Add`, `Fix`, `Remove`…), body explains *why*.
- **Pull requests** — one topic each; fill in the template; keep `main` green. PRs are squash-merged.
- **Secrets** — never commit keys, `.env` files or server details; only `*.env.example` with placeholders.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.
