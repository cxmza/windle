# Deploy

Production = one Debian box behind Cloudflare (SSH alias `<SSH_HOST>`). Full runbook, architecture, rotation,
backups: [`infra/README.md`](infra/README.md). Everything below runs from the repo root in Git Bash; Docker is
needed only on the server.

## Before any deploy

```bash
npm install && npm run typecheck && npm run lint && npm test
```

## Static sites (new immutable release + atomic switch, 5 kept)

```bash
export VITE_API_URL=https://api.windle.fun VITE_APP_URL=https://app.windle.fun \
       VITE_AUTH_URL=https://oauth.windle.fun VITE_DOCS_URL=https://docs.windle.fun

npm run build -w @windle/web  && infra/scripts/push-static.sh web  apps/web/dist     # www.windle.fun
npm run build -w @windle/app  && infra/scripts/push-static.sh app  apps/app/dist     # app.windle.fun
npm run build -w @windle/auth && infra/scripts/push-static.sh auth apps/auth/dist    # oauth.windle.fun
npm run build -w @windle/docs && infra/scripts/push-static.sh docs apps/docs/dist    # docs.windle.fun
npm run brand:cdn && infra/scripts/push-infra.sh --no-install \
  && ssh <SSH_HOST> /opt/windle/bin/deploy-static.sh cdn /opt/windle/infra/cdn         # cdn.windle.fun
```

Rollback: `ssh <SSH_HOST> /opt/windle/bin/deploy-static.sh --rollback <web|app|auth|docs|cdn>`.

## API (built on the server, migrations with the owner role, health-gated switch)

```bash
infra/scripts/push-api.sh                                   # build windle/api:<UTC ts>, migrate, switch, wait /ready
ssh <SSH_HOST> /opt/windle/bin/deploy-api.sh --list
ssh <SSH_HOST> /opt/windle/bin/deploy-api.sh --rollback [tag]  # image only; migrations are forward-only
ssh <SSH_HOST> /opt/windle/bin/api-integration-test.sh /opt/windle/incoming/api-src-<tag>
```

## Server config (nginx, compose, scripts, secrets)

```bash
infra/scripts/push-infra.sh      # copies infra/ and runs the idempotent install.sh (nginx -t before every reload)
```

Secrets live only in `/opt/windle/shared/*.env` (0600) on the server and are generated there; never commit or
print them.
