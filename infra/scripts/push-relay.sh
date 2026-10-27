#!/bin/bash
# Run from a workstation (Git Bash / Linux / macOS): ship services/x-relay and release it on the server.
# Usage: infra/scripts/push-relay.sh [tag]        (default tag: UTC timestamp, e.g. 20261013T170000Z)
#
# Ships ONLY the Go module (go.mod, go.sum, main.go, internal/ without tests/testdata). Unpacked at
# /opt/windle/incoming/x-relay-src-<tag>, then /opt/windle/bin/deploy-relay.sh builds windle/x-relay:<tag> there,
# switches and waits for health. Needs push-infra.sh once before (compose service, x-relay.env, deploy-relay.sh).
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
host="${WINDLE_SSH:?set WINDLE_SSH to the SSH host alias of the server}"
tag="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$tag" in *[!A-Za-z0-9._-]*) echo "bad tag: $tag" >&2; exit 1 ;; esac

cd "$repo/services/x-relay"
tar -czf - --exclude='*_test.go' --exclude=testdata Dockerfile .dockerignore go.mod go.sum main.go internal \
    | ssh -o BatchMode=yes "$host" "set -e
  d=/opt/windle/incoming/x-relay-src-$tag
  rm -rf \"\$d\" && mkdir -p \"\$d\"
  tar -xzf - -C \"\$d\" --no-same-owner
  /opt/windle/bin/deploy-relay.sh \"\$d\" $tag"
