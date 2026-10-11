#!/bin/bash
# Run from a workstation (Git Bash / Linux / macOS): ship a local build and deploy it atomically.
# Usage: infra/scripts/push-static.sh <site> <local-dist-dir>
#   e.g. npm run build -w apps/app && infra/scripts/push-static.sh app apps/app/dist
# Needs only ssh + tar (no rsync on the client). The SSH host alias comes from WINDLE_SSH (required).
set -euo pipefail
site="${1:?usage: push-static.sh <site> <dist-dir>}"
dist="${2:?usage: push-static.sh <site> <dist-dir>}"
host="${WINDLE_SSH:?set WINDLE_SSH to the SSH host alias of the server}"
[ -f "$dist/index.html" ] || { echo "$dist/index.html missing - build first" >&2; exit 1; }

tar -C "$dist" -czf - . | ssh -o BatchMode=yes "$host" "set -e
  inc=\$(mktemp -d /opt/windle/incoming/$site.XXXXXX)
  trap 'rm -rf \"\$inc\"' EXIT
  tar -xzf - -C \"\$inc\" --no-same-owner
  /opt/windle/bin/deploy-static.sh $site \"\$inc\""
