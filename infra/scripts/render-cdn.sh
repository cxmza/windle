#!/bin/bash
# Fills the signed demo/brand-kit image URLs into a staged cdn release (index.html placeholders {{...}}).
# Runs on the server (needs the signing key). Usage: render-cdn.sh <staged-cdn-dir>
set -euo pipefail
DIR="${1:?usage: render-cdn.sh <staged-cdn-dir>}"
SIGN=/opt/windle/bin/imgproxy-url.sh
F="$DIR/index.html"
[ -f "$F" ] || { echo "no $F" >&2; exit 1; }

rel() { "$SIGN" "$@" | sed 's|^https://cdn.windle.fun||'; }

declare -A U=(
  [IMG_HERO]="$(rel rs:fill:1200:600/g:ce samples/aurora.jpg)"
  [IMG_AVIF]="$(rel rs:fill:480:320 samples/aurora.jpg avif)"
  [IMG_WEBP]="$(rel rs:fill:480:320 samples/aurora.jpg webp)"
  [IMG_JPEG]="$(rel rs:fill:480:320 samples/aurora.jpg jpg)"
  [PNG_BLUE_512]="$(rel rs:fit:512:512 brand/windle-mark-blue.svg png)"
  [PNG_BLUE_1024]="$(rel rs:fit:1024:1024 brand/windle-mark-blue.svg png)"
  [PNG_WHITE_512]="$(rel rs:fit:512:512 brand/windle-mark-white.svg png)"
  [PNG_BLACK_512]="$(rel rs:fit:512:512 brand/windle-mark-black.svg png)"
  [PNG_ICON_1024]="$(rel rs:fit:1024:1024 brand/windle-app-icon.svg png)"
)
for k in "${!U[@]}"; do
    sed -i "s|{{$k}}|${U[$k]}|g" "$F"
done
if grep -q '{{' "$F"; then
    echo "unrendered placeholders left in $F" >&2
    exit 1
fi
echo "cdn landing rendered"
