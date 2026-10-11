#!/bin/bash
# Run from a workstation (Git Bash / Linux / macOS): ship the api build context and release it on the server.
# Usage: infra/scripts/push-api.sh [tag]        (default tag: UTC timestamp, e.g. 20261011T170000Z)
#
# Ships ONLY what apps/api/Dockerfile needs (repo-root manifests + lockfile, packages/shared, apps/api) - never
# node_modules, dist, .env* files or the root key/ folder. Unpacked at /opt/windle/incoming/api-src-<tag>, then
# /opt/windle/bin/deploy-api.sh builds windle/api:<tag> there, migrates, switches and waits for /ready.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
host="${WINDLE_SSH:?set WINDLE_SSH to the SSH host alias of the server}"
tag="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$tag" in *[!A-Za-z0-9._-]*) echo "bad tag: $tag" >&2; exit 1 ;; esac

cd "$repo"
paths=(package.json package-lock.json tsconfig.base.json apps/*/package.json packages/*/package.json packages/shared apps/api)
tar -czf - --exclude=node_modules --exclude=dist --exclude='.env*' --exclude='*.local' --exclude='*.tsbuildinfo' \
    "${paths[@]}" | ssh -o BatchMode=yes "$host" "set -e
  d=/opt/windle/incoming/api-src-$tag
  rm -rf \"\$d\" && mkdir -p \"\$d\"
  tar -xzf - -C \"\$d\" --no-same-owner
  /opt/windle/bin/deploy-api.sh \"\$d\" $tag"
