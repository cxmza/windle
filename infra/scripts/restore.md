# windle restore runbook

Backups live in `/opt/windle/backups` (root-only, mode 700), produced nightly at 03:41 UTC by
`/opt/windle/bin/backup.sh` (log: `/opt/windle/logs/backup.log`):

| file | what | how it was checked |
|---|---|---|
| `pg/windle-<ts>.dump` | `pg_dump -Fc` of database `windle` | `pg_restore --list` read the TOC |
| `pg/globals-<ts>.sql` | roles + password hashes (`pg_dumpall --globals-only`) | written without error |
| `redis/dump-<ts>.rdb` | RDB snapshot after `BGSAVE` | `rdb_last_bgsave_status:ok` + `REDIS` magic header |
| `media/<ab>/<sha256>.webp` | mirror of the user image masters (`rsync --link-dest`: hard links, no extra space) | rsync exit 0 |

Newest 14 of each are kept. **They are on the same disk as the data** — see README "Offsite backups".

All commands below run as root on the server. Shorthand:

```bash
DC="docker compose -p windle -f /opt/windle/compose/docker-compose.prod.yml"
```

## 0. Before anything: take a fresh backup of the current state

```bash
/opt/windle/bin/backup.sh
```

Even a broken database is evidence. Do not skip this.

## 1. Postgres: restore one database from a dump (the usual case)

The database is recreated from scratch; roles already exist (they live outside the database).

```bash
DUMP=/opt/windle/backups/pg/windle-YYYYMMDDTHHMMSSZ.dump

# stop writers
$DC --profile api stop api

# inspect first
$DC exec -T postgres pg_restore --list < "$DUMP" | head -30

# recreate the database owned by windle_owner and restore into it
$DC exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'windle' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS windle;
CREATE DATABASE windle OWNER windle_owner;
REVOKE ALL ON DATABASE windle FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE windle TO windle_owner;
GRANT CONNECT ON DATABASE windle TO windle_app;
SQL
$DC exec -T postgres pg_restore -U postgres -d windle --exit-on-error --no-owner --role=windle_owner < "$DUMP"

# the dump carries GRANTs and default privileges; verify the app role can read
$DC exec -T postgres psql -U postgres -d windle -c '\dp' | head -40

$DC --profile api up -d api
```

`--no-owner --role=windle_owner` makes every restored object owned by `windle_owner`, regardless of who
owned it in the source — the least-privilege model (app = DML only) stays intact.

### Restore into a scratch database instead (to look, not to replace)

```bash
$DC exec -T postgres createdb -U postgres -O windle_owner windle_restore_check
$DC exec -T postgres pg_restore -U postgres -d windle_restore_check --no-owner --role=windle_owner < "$DUMP"
# ... inspect ..., then
$DC exec -T postgres dropdb -U postgres windle_restore_check
```

## 2. Postgres: total loss (volume gone / new server)

1. Recreate secrets **from the old `/opt/windle/shared/postgres.env` if you still have it**; otherwise
   `gen-secrets.sh` creates new ones (then also update `api.env`).
2. `docker compose ... up -d postgres` — the init script creates `windle_owner`, `windle_app` and an empty
   `windle` database with the role passwords from `postgres.env`.
3. If you need the exact old role passwords instead, apply the globals file **before** step 1 of section 1:
   `$DC exec -T postgres psql -U postgres < /opt/windle/backups/pg/globals-<ts>.sql`
   (errors "role already exists" are expected; the `ALTER ROLE ... PASSWORD` lines still apply.)
4. Continue with section 1.

## 3. Redis

Redis holds sessions (db 0) and rate-limit counters (db 1). Losing it logs everyone out; it does not lose
user data. Restore only if that matters.

Why the dance: Redis runs with `appendonly yes`, and on start it loads the AOF and ignores `dump.rdb`.
Starting the normal service with an RDB but no AOF would create a fresh AOF from an EMPTY dataset.
So the RDB is loaded by a temporary instance with AOF off, AOF is switched on at runtime (Redis rewrites
it from the loaded data), and only then the normal service starts again.

```bash
RDB=/opt/windle/backups/redis/dump-YYYYMMDDTHHMMSSZ.rdb
VOL=$(docker volume inspect windle_redisdata -f '{{.Mountpoint}}')

$DC stop redis
mv "$VOL/appendonlydir" "$VOL/appendonlydir.before-restore"
cp "$RDB" "$VOL/dump.rdb" && chown --reference="$VOL/appendonlydir.before-restore" "$VOL/dump.rdb"

docker run --rm -d --name windle-redis-restore -v windle_redisdata:/data redis:7-alpine   redis-server --appendonly no --dir /data
sleep 3
docker exec windle-redis-restore redis-cli DBSIZE                 # expect your keys
docker exec windle-redis-restore redis-cli CONFIG SET appendonly yes
sleep 5
docker exec windle-redis-restore redis-cli INFO persistence | grep -E 'aof_rewrite_in_progress|aof_last_bgrewrite_status'
# wait for aof_rewrite_in_progress:0 and status ok, then
docker stop windle-redis-restore
$DC up -d redis
$DC exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli DBSIZE'
# once satisfied: rm -rf "$VOL/appendonlydir.before-restore"
```

## 3b. User image masters

`/opt/windle/backups/media/` mirrors `/opt/windle/media/` as of the last backup (hard links to the same files, so it
guards against deletion, not against losing the disk). Masters are content-addressed and never change, so restoring
is a copy back; files whose rows are `removed` (taken down) are not served even if present.

```bash
rsync -a --ignore-existing /opt/windle/backups/media/ /opt/windle/media/
chown -R 1000:1000 /opt/windle/media && find /opt/windle/media -type d -exec chmod 755 {} +   && find /opt/windle/media -type f -exec chmod 644 {} +
```

After a database restore to an older dump, masters uploaded later are orphans (no row): harmless, never linked.
**Takedowns made after that dump are lost with it**: re-apply them (`DELETE /v1/admin/media/<id>`; the ids are in
the api log, `"msg":"media taken down"`) before anything else, and never copy a taken-down master back.
Masters the database still lists as `active` but that are missing on disk return 404 at the CDN; uploading the
same image again rewrites the file.

## 4. Static sites

Releases are kept on disk (5 per site). Roll back without a backup:

```bash
/opt/windle/bin/deploy-static.sh --list app
/opt/windle/bin/deploy-static.sh --rollback app
```

## 5. nginx config

Every `install.sh` run snapshots the previous windle nginx files to
`/opt/windle/backups/nginx-windle-<ts>.tar` (newest 10 kept):

```bash
tar -tf /opt/windle/backups/nginx-windle-<ts>.tar
tar -C / -xf /opt/windle/backups/nginx-windle-<ts>.tar && nginx -t && systemctl reload nginx
```

## 6. After any restore

- `$DC ps` — all healthy; `curl -s https://api.windle.fun/ready` once the api runs.
- Run `/opt/windle/bin/backup.sh` again so the newest backup reflects the restored state.
