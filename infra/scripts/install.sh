#!/bin/bash
# windle server installer. Idempotent: safe to re-run after every infra change.
# Runs ON the server as root from /opt/windle/infra (copied there by scripts/push-infra.sh).
#
# Touches only windle-owned things: /opt/windle, /etc/nginx/{conf.d,snippets,sites-*}/windle-*,
# /etc/cron.d/windle-*, /etc/logrotate.d/windle, /var/cache/nginx/windle-img, docker project `windle`,
# the brotli nginx modules, and the global cloudflare-realip snippet (via cf-realip-update.sh).
# It never touches other services on the host, sshd, firewall or networking.
#
# Env knobs:  WINDLE_REDEPLOY_CDN=1      redeploy the cdn landing/brand kit from infra/cdn
#             WINDLE_REDEPLOY_PLACEHOLDERS=1   overwrite live sites with placeholders (careful)
#             WINDLE_STOP_BEFORE_CERT=1  first install only: stop once :80 serves ACME, to test the path
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
ROOT=/opt/windle
NGX=/etc/nginx
DC=(docker compose -p windle -f "$ROOT/compose/docker-compose.prod.yml")

step() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

step "layout"
install -d -m 755 "$ROOT" "$ROOT/releases" "$ROOT/current" "$ROOT/bin" "$ROOT/www-acme" "$ROOT/logs" "$ROOT/compose"
install -d -m 700 "$ROOT/shared" "$ROOT/backups" "$ROOT/incoming"
install -d -m 755 -o www-data -g www-data /var/cache/nginx/windle-img

step "packages (brotli for nginx, brotli CLI for precompression)"
need=()
for p in libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static brotli rsync; do
    dpkg -s "$p" > /dev/null 2>&1 || need+=("$p")
done
if [ "${#need[@]}" -gt 0 ]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${need[@]}"
else
    echo "all present"
fi

step "secrets"
# creates missing *.env (api.env = runtime DML role, api-migrate.env = owner role for the one-off `migrate`
# service only) and reconciles an older api.env (adds missing keys, moves DATABASE_MIGRATION_URL out of it)
bash "$SRC/scripts/gen-secrets.sh"

step "bin"
for s in backup cf-realip-update deploy-static deploy-api api-integration-test render-cdn imgproxy-url disk-watch \
    maintenance issue-cert gen-secrets; do
    install -m 755 -o root -g root "$SRC/scripts/$s.sh" "$ROOT/bin/$s.sh"
done
install -m 644 "$SRC/scripts/restore.md" "$ROOT/bin/restore.md"

step "compose files"
rsync -a --delete "$SRC/compose/" "$ROOT/compose/"
chmod 755 "$ROOT/compose/postgres/initdb/"*.sh
"${DC[@]}" config -q

step "nginx"
snapshot="$ROOT/backups/nginx-windle-$(date -u +%Y%m%dT%H%M%SZ).tar"
(cd / && ls -d etc/nginx/conf.d/windle-* etc/nginx/snippets/windle-* etc/nginx/sites-available/windle-* \
    etc/nginx/sites-enabled/windle-* 2>/dev/null || true) > "$snapshot.list"
tar -C / -cf "$snapshot" -T "$snapshot.list"
rm -f "$snapshot.list"
ls -1t "$ROOT"/backups/nginx-windle-*.tar | tail -n +11 | xargs -r rm -f --
restore_nginx() {
    echo "nginx -t failed - restoring previous windle nginx files" >&2
    rm -f "$NGX"/conf.d/windle-* "$NGX"/snippets/windle-* "$NGX"/sites-available/windle-* "$NGX"/sites-enabled/windle-*
    tar -C / -xf "$snapshot"
    nginx -t && systemctl reload nginx
    exit 1
}
install -m 644 "$SRC"/nginx/conf.d/*.conf "$NGX/conf.d/"
install -m 644 "$SRC"/nginx/snippets/*.conf "$NGX/snippets/"
rm -f "$NGX"/sites-available/windle-*
install -m 644 "$SRC"/nginx/sites/*.conf "$NGX/sites-available/"
rm -f "$NGX"/sites-enabled/windle-*

enable_sites() { for f in "$@"; do ln -sfn "$NGX/sites-available/$f" "$NGX/sites-enabled/$f"; done; }

if [ ! -f /etc/letsencrypt/live/windle.fun/fullchain.pem ]; then
    echo "no certificate yet: enabling HTTP-only sites for ACME"
    enable_sites windle-00-default.conf windle-01-port80.conf
    nginx -t || restore_nginx
    systemctl reload nginx
    if [ "${WINDLE_STOP_BEFORE_CERT:-0}" = 1 ]; then
        echo "WINDLE_STOP_BEFORE_CERT=1: stopping before certificate issuance"
        exit 0
    fi
    bash "$ROOT/bin/issue-cert.sh"
fi
enable_sites $(cd "$SRC/nginx/sites" && ls *.conf)
nginx -t || restore_nginx
systemctl reload nginx
echo "nginx reloaded with $(ls "$NGX"/sites-enabled/windle-* | wc -l) windle sites"

step "certbot deploy hook"
hook=/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
if [ ! -f "$hook" ]; then
    install -D -m 755 "$SRC/letsencrypt/renewal-hooks/deploy/reload-nginx.sh" "$hook"
else
    echo "present: $hook"
fi

step "cloudflare real-ip list"
bash "$ROOT/bin/cf-realip-update.sh" || echo "cf-realip-update failed (non-fatal, existing list kept)"

step "containers"
"${DC[@]}" pull -q postgres redis imgproxy
# Once an api image exists the api is part of the running set: activating its profile keeps it running and
# makes sure --remove-orphans can never treat it as an orphan. Releases themselves go through deploy-api.sh.
profiles=()
services=(postgres redis imgproxy)
if docker image inspect windle/api:current > /dev/null 2>&1; then
    profiles=(--profile api)
    services+=(api)
fi
"${DC[@]}" "${profiles[@]}" up -d --remove-orphans "${services[@]}"
for _ in $(seq 1 60); do
    unhealthy="$("${DC[@]}" ps --format '{{.Service}} {{.Health}}' | grep -v ' healthy$' || true)"
    [ -z "$unhealthy" ] && break
    sleep 2
done
"${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'

step "static sites"
stage="$(mktemp -d "$ROOT/incoming/placeholders.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
bash "$SRC/placeholders/render.sh" "$stage" > /dev/null
for site in web app auth docs; do
    if [ ! -e "$ROOT/current/$site" ] || [ "${WINDLE_REDEPLOY_PLACEHOLDERS:-0}" = 1 ]; then
        "$ROOT/bin/deploy-static.sh" "$site" "$stage/$site"
    else
        echo "keep live $site -> $(readlink "$ROOT/current/$site")"
    fi
done
if [ ! -e "$ROOT/current/cdn" ] || [ "${WINDLE_REDEPLOY_CDN:-0}" = 1 ]; then
    "$ROOT/bin/deploy-static.sh" cdn "$SRC/cdn"
else
    echo "keep live cdn -> $(readlink "$ROOT/current/cdn")"
fi

step "cron + logrotate"
for c in "$SRC"/cron/windle-*; do
    install -m 644 -o root -g root "$c" "/etc/cron.d/$(basename "$c")"
done
install -m 644 "$SRC/logrotate/windle" /etc/logrotate.d/windle

step "done"
