#!/bin/sh
# Runs once, on an empty data directory (postgres image initdb hook).
#
# Two login roles, least privilege:
#   windle_owner - owns database `windle` and its schemas; runs migrations (drizzle-kit). DDL allowed.
#   windle_app   - what the api connects as at runtime: CONNECT + DML on tables the owner creates. No DDL,
#                  no TRUNCATE, cannot create schemas or objects, cannot grant.
# The bootstrap superuser `postgres` is for maintenance/backups only (local socket inside the container).
#
# Passwords come from /opt/windle/shared/postgres.env (WINDLE_OWNER_PASSWORD, WINDLE_APP_PASSWORD).
set -eu

: "${WINDLE_OWNER_PASSWORD:?WINDLE_OWNER_PASSWORD is required}"
: "${WINDLE_APP_PASSWORD:?WINDLE_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$WINDLE_OWNER_PASSWORD" -v app_pw="$WINDLE_APP_PASSWORD" <<'SQL'
CREATE ROLE windle_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
CREATE ROLE windle_app   LOGIN PASSWORD :'app_pw'   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 35;

ALTER DATABASE windle OWNER TO windle_owner;
REVOKE ALL ON DATABASE windle FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE windle TO windle_owner;
GRANT CONNECT ON DATABASE windle TO windle_app;
-- The maintenance databases are for the superuser only (PUBLIC can connect to them by default).
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname windle <<'SQL'
-- PG15+: public schema is owned by pg_database_owner (= windle_owner now) and PUBLIC has no CREATE on it.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO windle_app;

-- Everything windle_owner creates later in `public` is usable (DML only) by windle_app.
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO windle_app;
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO windle_app;
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO windle_app;
ALTER DEFAULT PRIVILEGES FOR ROLE windle_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Sane per-role defaults (the app should fail fast instead of piling up).
ALTER ROLE windle_app   IN DATABASE windle SET statement_timeout = '15s';
ALTER ROLE windle_app   IN DATABASE windle SET lock_timeout = '5s';
ALTER ROLE windle_owner IN DATABASE windle SET lock_timeout = '10s';
SQL

echo "windle roles created: windle_owner (DDL/migrations), windle_app (DML only)"
