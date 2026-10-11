## What

<!-- One or two sentences: what changes and why. Link the issue: Closes #123 -->

## Surface

- [ ] `apps/web` — landing
- [ ] `apps/app` — product app
- [ ] `apps/auth` — sign-in
- [ ] `apps/docs` — docs
- [ ] `apps/api` — API
- [ ] `packages/*` — tokens / brand / shared
- [ ] `infra` / CI

## How it was checked

<!-- Commands you ran and what they printed; screenshots or a short clip for UI and motion changes. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

## Checklist

- [ ] UI changes respect `prefers-reduced-motion` and work at 375 px width
- [ ] No secrets, `.env` files or server details in the diff
- [ ] Docs updated where behaviour changed
