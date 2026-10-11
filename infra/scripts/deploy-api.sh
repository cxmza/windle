#!/bin/bash
# api release on the server (installed as /opt/windle/bin/deploy-api.sh). Normally called by push-api.sh.
#
#   deploy-api.sh <src-dir> <tag>     build windle/api:<tag> from an uploaded repo-root context, run migrations
#                                     with the owner role (service `migrate`), switch windle/api:current, wait
#                                     for /ready; on failure switch back to the previous release and exit 1
#   deploy-api.sh --rollback [<tag>]  point windle/api:current at <tag> (default: the release before the
#                                     current one) and restart the api. Schema is NOT rolled back: migrations are
#                                     forward-only, so they must stay compatible with the previous release.
#   deploy-api.sh --list              images + release log
#
# Releases log: /opt/windle/logs/api-releases.log ("<utc-ts> <tag>" per switch, newest last).
set -euo pipefail

ROOT=/opt/windle
DC=(docker compose -p windle -f "$ROOT/compose/docker-compose.prod.yml")
LOG="$ROOT/logs/api-releases.log"

current_tag() { # tag that shares its image id with windle/api:current
    local id
    id="$(docker image inspect -f '{{.Id}}' windle/api:current 2> /dev/null)" || return 0
    docker images windle/api --no-trunc --format '{{.ID}} {{.Tag}}' | awk -v id="$id" '$1 == id && $2 != "current" { print $2; exit }'
}

wait_ready() { # up to ~90 s: container healthy and GET /ready = 200
    local cid health code
    for _ in $(seq 1 45); do
        cid="$("${DC[@]}" --profile api ps -q api)"
        health="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2> /dev/null || true)"
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3001/ready || true)"
        if [ "$health" = healthy ] && [ "$code" = 200 ]; then
            return 0
        fi
        sleep 2
    done
    return 1
}

switch_to() { # <tag>
    docker tag "windle/api:$1" windle/api:current
    "${DC[@]}" --profile api up -d --no-deps api
    echo "$(date -u +%Y%m%dT%H%M%SZ) $1" >> "$LOG"
}

case "${1:-}" in
    --list)
        docker images windle/api --format 'table {{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}'
        echo "current -> $(current_tag)"
        tail -n 10 "$LOG" 2> /dev/null || true
        exit 0
        ;;
    --rollback)
        cur="$(current_tag)"
        target="${2:-$(awk '{ print $2 }' "$LOG" 2> /dev/null | grep -vx "$cur" | tail -n 1)}"
        [ -n "$target" ] || { echo "no previous release to roll back to" >&2; exit 1; }
        docker image inspect "windle/api:$target" > /dev/null
        echo "rollback api: $cur -> $target"
        switch_to "$target"
        wait_ready || { echo "api not ready after rollback" >&2; exit 1; }
        echo "api ready on $target"
        exit 0
        ;;
    "" | -*)
        sed -n '2,13p' "$0"
        exit 2
        ;;
esac

src="$1"
tag="${2:?usage: deploy-api.sh <src-dir> <tag>}"
[ -f "$src/apps/api/Dockerfile" ] || { echo "$src/apps/api/Dockerfile missing" >&2; exit 1; }
prev="$(current_tag)"

echo "== build windle/api:$tag (previous: ${prev:-none})"
DOCKER_BUILDKIT=1 docker build -f "$src/apps/api/Dockerfile" -t "windle/api:$tag" --build-arg "APP_COMMIT=$tag" "$src"

echo "== migrate (owner role, api-migrate.env)"
WINDLE_API_TAG="$tag" "${DC[@]}" --profile migrate run --rm migrate

echo "== switch"
switch_to "$tag"
if wait_ready; then
    echo "api ready on $tag"
else
    echo "api NOT ready on $tag" >&2
    "${DC[@]}" --profile api logs --tail 50 api >&2 || true
    if [ -n "$prev" ]; then
        echo "rolling back to $prev" >&2
        switch_to "$prev"
        wait_ready && echo "api ready on $prev (rolled back)" >&2
    fi
    exit 1
fi

# keep the two newest uploaded sources (rebuilds, integration tests); older ones go
ls -1dt "$ROOT"/incoming/api-src-* 2> /dev/null | tail -n +3 | xargs -r rm -rf --
