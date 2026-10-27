#!/bin/bash
# Creates /opt/windle/shared/*.env with strong random values. Idempotent: an existing file is NEVER
# overwritten (overwriting postgres.env after init would desync it from the roles inside the database).
# Prints file names only, never values.
set -euo pipefail
umask 077

SHARED=/opt/windle/shared
install -d -m 700 -o root -g root "$SHARED"

rand() { openssl rand -hex "$1"; }

write_once() { # <file> ; content on stdin
    local f="$SHARED/$1"
    if [ -e "$f" ]; then
        echo "keep   $f"
        cat > /dev/null
        return
    fi
    cat > "$f.tmp"
    chmod 600 "$f.tmp"
    mv "$f.tmp" "$f"
    echo "create $f"
}

load() { # <file> - export its variables into this shell without printing them
    set -a
    # shellcheck disable=SC1090
    . "$SHARED/$1"
    set +a
}

write_once postgres.env <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(rand 32)
POSTGRES_DB=windle
WINDLE_OWNER_PASSWORD=$(rand 32)
WINDLE_APP_PASSWORD=$(rand 32)
EOF

write_once redis.env <<EOF
REDIS_PASSWORD=$(rand 32)
EOF

write_once imgproxy.env <<EOF
IMGPROXY_KEY=$(rand 64)
IMGPROXY_SALT=$(rand 64)
EOF

load postgres.env
load redis.env
load imgproxy.env

# Runtime api env: DML-only database role. The owner (DDL) URL is NOT here - see api-migrate.env.
# Every variable apps/api/src/config.ts needs in production is explicit (reference: apps/api/.env.example).
# TRUST_PROXY: loopback + docker bridge range (the compose network, 172.18.0.0/16 today, sits inside it;
# a recreated network may get another 172.x subnet, so the /12 is deliberate).
write_once api.env <<EOF
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
TRUST_PROXY=127.0.0.1,::1,172.16.0.0/12
DATABASE_URL=postgres://windle_app:${WINDLE_APP_PASSWORD}@postgres:5432/windle
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_RATE_LIMIT_URL=redis://:${REDIS_PASSWORD}@redis:6379/1
COOKIE_SECRET=$(rand 32)
SESSION_COOKIE_NAME=wl_session
SESSION_COOKIE_DOMAIN=.windle.fun
SESSION_COOKIE_SECURE=true
SESSION_TTL_SECONDS=2592000
PUBLIC_WEB_ORIGIN=https://www.windle.fun
PUBLIC_APP_ORIGIN=https://app.windle.fun
PUBLIC_AUTH_ORIGIN=https://oauth.windle.fun
PUBLIC_API_ORIGIN=https://api.windle.fun
PUBLIC_DOCS_ORIGIN=https://docs.windle.fun
PUBLIC_CDN_ORIGIN=https://cdn.windle.fun
CORS_ALLOWED_ORIGINS=https://www.windle.fun,https://app.windle.fun,https://oauth.windle.fun,https://docs.windle.fun
SIWS_DOMAIN=oauth.windle.fun
SIWS_URI=https://oauth.windle.fun
METRICS_TOKEN=$(rand 32)
IMGPROXY_KEY=${IMGPROXY_KEY}
IMGPROXY_SALT=${IMGPROXY_SALT}
AUTH_SIWS_ENABLED=true
AUTH_EMAIL_ENABLED=false
AUTH_X_ENABLED=false
AUTH_GOOGLE_ENABLED=false
X_RELAY_URL=http://x-relay:3010
ADMIN_WALLETS=
EOF

# X feed relay (compose service `x-relay`, profile "relay"). No secrets today; an optional X_RELAY_PROXY may carry
# credentials, hence 0600 like every other env file.
write_once x-relay.env <<EOF
X_RELAY_TAGS=kol,founder
X_RELAY_LOG_LEVEL=info
EOF

# One-off migrations only (compose service `migrate`, profile "migrate"): owner role with DDL.
write_once api-migrate.env <<EOF
DATABASE_MIGRATION_URL=postgres://windle_owner:${WINDLE_OWNER_PASSWORD}@postgres:5432/windle
EOF

# --- reconcile an api.env written by an older version of this script (never changes an existing value) ---
ensure() { # <file> <KEY> <value> : append KEY=value only when KEY is absent
    local f="$SHARED/$1"
    if ! grep -q "^$2=" "$f"; then
        printf '%s=%s\n' "$2" "$3" >> "$f"
        echo "add    $f: $2"
    fi
}
ensure api.env SESSION_COOKIE_SECURE true
ensure api.env PUBLIC_DOCS_ORIGIN https://docs.windle.fun
ensure api.env SIWS_DOMAIN oauth.windle.fun
ensure api.env SIWS_URI https://oauth.windle.fun
ensure api.env METRICS_TOKEN "$(rand 32)"
ensure api.env X_RELAY_URL http://x-relay:3010
ensure api.env ADMIN_WALLETS ""
# The api signs cdn image URLs (user uploads) with the imgproxy key; required in production since the media pipeline.
ensure api.env IMGPROXY_KEY "${IMGPROXY_KEY}"
ensure api.env IMGPROXY_SALT "${IMGPROXY_SALT}"
# The owner URL must not be visible to the long-running api: drop it once api-migrate.env holds it.
if grep -q '^DATABASE_MIGRATION_URL=' "$SHARED/api.env" && grep -q '^DATABASE_MIGRATION_URL=' "$SHARED/api-migrate.env"; then
    sed -i '/^DATABASE_MIGRATION_URL=/d' "$SHARED/api.env"
    echo "strip  $SHARED/api.env: DATABASE_MIGRATION_URL (lives in api-migrate.env)"
fi
chmod 600 "$SHARED"/*.env
