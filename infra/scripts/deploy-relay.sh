#!/bin/bash
# x-relay release on the server (installed as /opt/windle/bin/deploy-relay.sh). Normally called by push-relay.sh.
#
#   deploy-relay.sh <src-dir> <tag>     build windle/x-relay:<tag> from an uploaded services/x-relay, switch
#                                       windle/x-relay:current, wait until the container is healthy and
#                                       GET 127.0.0.1:3010/health = 200; on failure switch back and exit 1
#   deploy-relay.sh --rollback [<tag>]  point windle/x-relay:current at <tag> (default: the release before the
#                                       current one) and restart the relay
#   deploy-relay.sh --list              images + release log
#   deploy-relay.sh --stop              stop and remove the relay container (the api then answers 503
#                                       x_feed_unavailable on /v1/x/recent and retry hints on /v1/x/stream)
#
# Releases log: /opt/windle/logs/x-relay-releases.log ("<utc-ts> <tag>" per switch, newest last).
set -euo pipefail

ROOT=/opt/windle
DC=(docker compose -p windle -f "$ROOT/compose/docker-compose.prod.yml" --profile relay)
LOG="$ROOT/logs/x-relay-releases.log"
IMAGE=windle/x-relay

current_tag() { # tag that shares its image id with windle/x-relay:current
    local id
    id="$(docker image inspect -f '{{.Id}}' "$IMAGE:current" 2> /dev/null)" || return 0
    docker images "$IMAGE" --no-trunc --format '{{.ID}} {{.Tag}}' | awk -v id="$id" '$1 == id && $2 != "current" { print $2; exit }'
}

wait_healthy() { # up to ~60 s: container healthy and GET /health = 200
    local cid health code
    for _ in $(seq 1 30); do
        cid="$("${DC[@]}" ps -q x-relay)"
        health="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2> /dev/null || true)"
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3010/health || true)"
        if [ "$health" = healthy ] && [ "$code" = 200 ]; then
            return 0
        fi
        sleep 2
    done
    return 1
}

upstream_state() { # informational: is gmgn connected? (an IP ban shows up here, not as unhealthy)
    for _ in $(seq 1 10); do
        if curl -s --max-time 3 http://127.0.0.1:3010/health | grep -q '"connected":true'; then
            echo "upstream: connected"
            return 0
        fi
        sleep 2
    done
    echo "upstream: NOT connected after 20 s - check: ${DC[*]} logs --tail 50 x-relay" >&2
}

switch_to() { # <tag>
    docker tag "$IMAGE:$1" "$IMAGE:current"
    "${DC[@]}" up -d --no-deps x-relay
    echo "$(date -u +%Y%m%dT%H%M%SZ) $1" >> "$LOG"
}

case "${1:-}" in
    --list)
        docker images "$IMAGE" --format 'table {{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}'
        echo "current -> $(current_tag)"
        tail -n 10 "$LOG" 2> /dev/null || true
        exit 0
        ;;
    --rollback)
        cur="$(current_tag)"
        target="${2:-$(awk '{ print $2 }' "$LOG" 2> /dev/null | grep -vx "$cur" | tail -n 1)}"
        [ -n "$target" ] || { echo "no previous release to roll back to" >&2; exit 1; }
        docker image inspect "$IMAGE:$target" > /dev/null
        echo "rollback x-relay: $cur -> $target"
        switch_to "$target"
        wait_healthy || { echo "x-relay not healthy after rollback" >&2; exit 1; }
        echo "x-relay healthy on $target"
        exit 0
        ;;
    --stop)
        "${DC[@]}" rm -sf x-relay
        exit 0
        ;;
    "" | -*)
        sed -n '2,14p' "$0"
        exit 2
        ;;
esac

src="$1"
tag="${2:?usage: deploy-relay.sh <src-dir> <tag>}"
[ -f "$src/Dockerfile" ] && [ -f "$src/go.mod" ] || { echo "$src is not services/x-relay" >&2; exit 1; }
[ -f "$ROOT/shared/x-relay.env" ] || { echo "$ROOT/shared/x-relay.env missing: run push-infra.sh first" >&2; exit 1; }
prev="$(current_tag)"

echo "== build $IMAGE:$tag (previous: ${prev:-none})"
DOCKER_BUILDKIT=1 docker build -t "$IMAGE:$tag" --build-arg "APP_COMMIT=$tag" "$src"

echo "== switch"
switch_to "$tag"
if wait_healthy; then
    echo "x-relay healthy on $tag"
    upstream_state || true
else
    echo "x-relay NOT healthy on $tag" >&2
    "${DC[@]}" logs --tail 50 x-relay >&2 || true
    if [ -n "$prev" ]; then
        echo "rolling back to $prev" >&2
        switch_to "$prev"
        wait_healthy && echo "x-relay healthy on $prev (rolled back)" >&2
    fi
    exit 1
fi

ls -1dt "$ROOT"/incoming/x-relay-src-* 2> /dev/null | tail -n +3 | xargs -r rm -rf --
