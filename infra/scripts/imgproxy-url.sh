#!/bin/bash
# Mints a signed cdn.windle.fun/img/ URL.
# Usage: imgproxy-url.sh <options> <path-in-cdn-release> [format]
#   imgproxy-url.sh rs:fill:1200:600 samples/aurora.jpg          -> auto AVIF/WebP by Accept
#   imgproxy-url.sh rs:fit:512:512 brand/windle-mark-blue.svg png -> pinned PNG
# Key/salt are read from /opt/windle/shared/imgproxy.env (root only). The signature is
# base64url(HMAC-SHA256(key, salt || "/<options>/plain/<path>[@fmt]")), IMGPROXY_SIGNATURE_SIZE=32 (default).
set -euo pipefail

OPTS="${1:?usage: imgproxy-url.sh <options> <path> [format]}"
SRC="${2:?usage: imgproxy-url.sh <options> <path> [format]}"
FMT="${3:-}"
ENV_FILE="${IMGPROXY_ENV_FILE:-/opt/windle/shared/imgproxy.env}"
BASE="${CDN_ORIGIN:-https://cdn.windle.fun}"

KEY="$(sed -n 's/^IMGPROXY_KEY=//p' "$ENV_FILE" | cut -d, -f1)"
SALT="$(sed -n 's/^IMGPROXY_SALT=//p' "$ENV_FILE" | cut -d, -f1)"
[ -n "$KEY" ] && [ -n "$SALT" ] || { echo "IMGPROXY_KEY/SALT missing in $ENV_FILE" >&2; exit 1; }

path="/${OPTS}/plain/${SRC}${FMT:+@$FMT}"
# Hex -> bytes with perl (perl-base is always present on Debian); sed/printf escape tricks are fragile.
sig="$( { perl -e 'print pack("H*", $ARGV[0])' "$SALT"; printf '%s' "$path"; } \
        | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$KEY" -binary \
        | base64 -w0 | tr '+/' '-_' | tr -d '=')"

printf '%s/img/%s%s\n' "$BASE" "$sig" "$path"
