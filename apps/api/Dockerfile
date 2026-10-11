# syntax=docker/dockerfile:1.7
#
# windle api image. Build from the REPO ROOT (npm workspaces: the lockfile and @windle/shared live there):
#
#   docker build -f apps/api/Dockerfile -t windle/api:$(git rev-parse --short HEAD) -t windle/api:current \
#     --build-arg APP_COMMIT=$(git rev-parse --short HEAD) .
#
# The build context is filtered by apps/api/Dockerfile.dockerignore (BuildKit per-Dockerfile ignore file).
# Runtime: node dist/server.js (the service), node dist/migrate.js (explicit migration step).

ARG NODE_IMAGE=node:22-alpine

# ---------- manifests: every workspace package.json, so `npm ci` sees a lockfile-consistent workspace tree --------
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/auth/package.json apps/auth/
COPY apps/docs/package.json apps/docs/
COPY apps/web/package.json apps/web/
COPY packages/brand/package.json packages/brand/
COPY packages/shared/package.json packages/shared/
COPY packages/tokens/package.json packages/tokens/

# ---------- build: full deps of @windle/api (+ @windle/shared), bundle with esbuild -------------------------------
FROM manifests AS build
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @windle/api --workspace @windle/shared --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
RUN npm run build --workspace @windle/api

# ---------- prod-deps: runtime dependencies of @windle/api only, no lifecycle scripts --------------------------------
# @windle/shared is bundled into dist, so its workspace symlink is dropped (it would dangle in the runtime image).
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @windle/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
 && mkdir -p apps/api/node_modules \
 && rm -rf node_modules/@windle

# ---------- runtime ------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG APP_COMMIT=""
RUN apk add --no-cache tini
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    APP_COMMIT=${APP_COMMIT}
WORKDIR /app/apps/api
# Repo layout is kept (/app/node_modules hoisted + /app/apps/api/node_modules nested) so Node module resolution
# is exactly what npm installed. Files are root-owned and read-only for the `node` user that runs the process.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY apps/api/package.json ./package.json

LABEL fun.windle.project="windle" \
      fun.windle.service="api" \
      org.opencontainers.image.title="windle-api" \
      org.opencontainers.image.revision="${APP_COMMIT}"

USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# tini as PID 1: forwards SIGTERM to node (graceful shutdown) and reaps zombies.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
