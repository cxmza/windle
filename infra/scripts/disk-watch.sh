#!/bin/bash
# Hourly disk report (log only, no actions). Writes one line to /opt/windle/logs/disk-watch.log and a
# syslog warning (tag windle-disk-watch) when the root filesystem crosses WARN_PCT.
set -euo pipefail
WARN_PCT="${WARN_PCT:-80}"

used_pct="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
avail="$(df -h --output=avail / | tail -1 | tr -d ' ')"
sz() { du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }
docker_vols="$(docker system df --format '{{.Type}}={{.Size}}' 2>/dev/null | tr '\n' ' ' || true)"

line="$(date -Is) root=${used_pct}% avail=${avail} backups=$(sz /opt/windle/backups) releases=$(sz /opt/windle/releases) img_cache=$(sz /var/cache/nginx/windle-img) nginx_logs=$(sz /var/log/nginx) docker[ ${docker_vols}]"
echo "$line"
if [ "$used_pct" -ge "$WARN_PCT" ]; then
    logger -t windle-disk-watch -p user.warning "root filesystem at ${used_pct}% (avail ${avail})"
    echo "$(date -Is) WARNING root filesystem at ${used_pct}%"
fi
