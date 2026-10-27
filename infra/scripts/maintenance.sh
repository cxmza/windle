#!/bin/bash
# Weekly: remove unused windle-built images older than 14 days. Only images carrying the label
# fun.windle.project=windle are touched (api and x-relay images); nothing else on this shared host.
set -euo pipefail
echo "$(date -Is) maintenance: start"
docker image prune -af --filter "label=fun.windle.project=windle" --filter "until=336h"
echo "$(date -Is) maintenance: done"
