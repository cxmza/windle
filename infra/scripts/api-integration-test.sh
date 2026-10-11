#!/bin/bash
# Runs apps/api integration tests (src/integration.test.ts) on the server against the real Postgres + Redis,
# isolated from production data: a scratch database (dropped afterwards) and a spare Redis db index
# (must be empty; flushed afterwards). Installed as /opt/windle/bin/api-integration-test.sh.
#
# Usage: api-integration-test.sh <src-dir>     e.g. /opt/windle/incoming/api-src-<tag> (left by push-api.sh)
# The tests run in a throwaway node:22-slim container on the compose network with dev deps installed into a
# temporary copy of the source. Secrets reach it through a 0600 env file, never on a command line.
set -euo pipefail

SRC="${1:?usage: api-integration-test.sh <src-dir>}"
ROOT=/opt/windle
DC=(docker compose -p windle -f "$ROOT/compose/docker-compose.prod.yml")
DB="windle_it_$(date -u +%Y%m%d%H%M%S)"
RDB="${WINDLE_IT_REDIS_DB:-15}"
NET=windle_default

set -a
# shellcheck disable=SC1091
. "$ROOT/shared/postgres.env"
# shellcheck disable=SC1091
. "$ROOT/shared/redis.env"
set +a

redis() { "${DC[@]}" exec -T -e REDISCLI_AUTH="$REDIS_PASSWORD" redis redis-cli -n "$RDB" "$@"; }
psql_su() { "${DC[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -q "$@"; }

[ "$(redis DBSIZE | tr -d '\r')" = 0 ] || { echo "redis db $RDB is not empty - pick another WINDLE_IT_REDIS_DB" >&2; exit 1; }

work="$(mktemp -d "$ROOT/incoming/api-it.XXXXXX")"
cleanup() {
    rm -rf "$work"
    psql_su -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || true
    redis FLUSHDB > /dev/null || true
    echo "cleaned up: database $DB dropped, redis db $RDB flushed"
}
trap cleanup EXIT

echo "== scratch database $DB (owner windle_owner, DML for windle_app - same grants as production)"
psql_su -d postgres -c "CREATE DATABASE $DB OWNER windle_owner"
psql_su -d postgres -c "GRANT CONNECT ON DATABASE $DB TO windle_app"
psql_su -d "$DB" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO windle_app;
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO windle_app;
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO windle_app;
SQL

cp -a "$SRC/." "$work/src"
umask 077
cat > "$work/it.env" <<EOF
INTEGRATION_DATABASE_URL=postgres://windle_app:${WINDLE_APP_PASSWORD}@postgres:5432/${DB}
INTEGRATION_DATABASE_MIGRATION_URL=postgres://windle_owner:${WINDLE_OWNER_PASSWORD}@postgres:5432/${DB}
INTEGRATION_REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/${RDB}
EOF

echo "== npm ci + vitest in node:22-slim"
docker run --rm --network "$NET" --env-file "$work/it.env" --memory 1g --cpus 1 \
    -v "$work/src:/src" -w /src node:22-slim sh -c '
      npm ci --workspace @windle/api --workspace @windle/shared --include-workspace-root=false \
        --no-audit --no-fund --loglevel=error &&
      npm run test:integration -w @windle/api'
