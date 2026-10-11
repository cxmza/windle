#!/bin/bash
# Run from a workstation: copy this infra/ directory to the server (/opt/windle/infra) and run install.sh.
# Usage: infra/scripts/push-infra.sh [--no-install]
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
host="${WINDLE_SSH:?set WINDLE_SSH to the SSH host alias of the server}"
tar -C "$here" -czf - --exclude='./README.md' . | ssh -o BatchMode=yes "$host" '
  set -e
  install -d -m 755 /opt/windle
  rm -rf /opt/windle/infra.next && mkdir -p /opt/windle/infra.next
  tar -xzf - -C /opt/windle/infra.next --no-same-owner
  find /opt/windle/infra.next -type f -name "*.sh" -exec sed -i "s/\r$//" {} +
  rm -rf /opt/windle/infra.prev
  [ -d /opt/windle/infra ] && mv /opt/windle/infra /opt/windle/infra.prev
  mv /opt/windle/infra.next /opt/windle/infra
  chown -R root:root /opt/windle/infra'
[ "${1:-}" = "--no-install" ] || ssh -o BatchMode=yes "$host" 'bash /opt/windle/infra/scripts/install.sh'
