#!/bin/bash
# Nightly backup: Postgres (pg_dump -Fc + roles) and Redis (RDB after BGSAVE) into /opt/windle/backups.
# Each artifact is verified before it is kept; failures exit non-zero and are logged (cron -> logs/backup.log).
# Retention: newest 14 of each kind. Offsite copy: TODO (needs a target from the owner, see README).
set -euo pipefail
umask 077

ROOT=/opt/windle
DIR="$ROOT/backups"
KEEP=14
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DC=(docker compose -p windle -f "$ROOT/compose/docker-compose.prod.yml")

log() { printf '%s backup: %s\n' "$(date -Is)" "$*"; }
fail() { log "FAILED: $*"; logger -t windle-backup -p user.err "backup failed: $*" || true; exit 1; }

exec 9> /run/windle-backup.lock
flock -n 9 || fail "another backup is running"

install -d -m 700 "$DIR" "$DIR/pg" "$DIR/redis"

# --- Postgres --------------------------------------------------------------------------------------
dump="$DIR/pg/windle-$TS.dump"
"${DC[@]}" exec -T postgres pg_dump -U postgres -d windle -Fc -Z 6 > "$dump.partial" \
    || fail "pg_dump exited non-zero"
# Verify: the archive must be readable by pg_restore and contain a TOC.
toc_entries="$("${DC[@]}" exec -T postgres pg_restore --list < "$dump.partial" | grep -vc '^;' || true)"
"${DC[@]}" exec -T postgres pg_restore --list < "$dump.partial" | grep -q '^; Archive created at' \
    || fail "pg_restore --list cannot read $dump.partial"
mv "$dump.partial" "$dump"
log "postgres ok: $(basename "$dump") $(du -h "$dump" | cut -f1), $toc_entries TOC entries"

globals="$DIR/pg/globals-$TS.sql"
"${DC[@]}" exec -T postgres pg_dumpall -U postgres --globals-only > "$globals" \
    || fail "pg_dumpall --globals-only"
log "postgres roles ok: $(basename "$globals")"

# --- Redis -----------------------------------------------------------------------------------------
rcli() { "${DC[@]}" exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli "$@"' _ "$@"; }
before="$(rcli LASTSAVE | tr -d '\r')"
rcli BGSAVE > /dev/null || fail "redis BGSAVE"
for _ in $(seq 1 60); do
    sleep 1
    now="$(rcli LASTSAVE | tr -d '\r')"
    [ "$now" != "$before" ] && break
done
[ "$now" != "$before" ] || fail "redis BGSAVE did not finish in 60s"
[ "$(rcli INFO persistence | tr -d '\r' | sed -n 's/^rdb_last_bgsave_status://p')" = ok ] \
    || fail "redis rdb_last_bgsave_status != ok"
rdb="$DIR/redis/dump-$TS.rdb"
"${DC[@]}" cp redis:/data/dump.rdb "$rdb.partial" > /dev/null || fail "copy dump.rdb"
[ "$(head -c 5 "$rdb.partial")" = "REDIS" ] || fail "dump.rdb has no REDIS magic header"
chmod 600 "$rdb.partial"
mv "$rdb.partial" "$rdb"
log "redis ok: $(basename "$rdb") $(du -h "$rdb" | cut -f1)"

# --- Retention -------------------------------------------------------------------------------------
prune() { ls -1t $1 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --; }
prune "$DIR/pg/windle-*.dump"
prune "$DIR/pg/globals-*.sql"
prune "$DIR/redis/dump-*.rdb"
rm -f "$DIR"/pg/*.partial "$DIR"/redis/*.partial
log "done; kept newest $KEEP of each"
