#!/bin/bash
# Renders the "coming online" placeholder for each static site into <out>/<site>/.
# Usage: render.sh <out-dir>      (then: deploy-static.sh <site> <out-dir>/<site>)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?usage: render.sh <out-dir>}"

# site|title|line
SITES=(
  "web|windle.fun|Make a promise, back it with collateral, let the market decide."
  "app|app.windle.fun|Your promises, markets and verdicts will live here."
  "auth|oauth.windle.fun|Sign in to windle with your Solana wallet."
  "docs|docs.windle.fun|Guides, API reference and the brand kit."
)

render() { # <template> <title> <line> <robots>
    sed -e "s|{{TITLE}}|$2|g" -e "s|{{LINE}}|$3|g" -e "s|{{ROBOTS}}|$4|g" "$1"
}

for entry in "${SITES[@]}"; do
    IFS='|' read -r site title line <<< "$entry"
    d="$OUT/$site"
    mkdir -p "$d"
    render "$HERE/template.html" "$title" "$line" "noindex" > "$d/index.html"
    render "$HERE/template.html" "Not found" "There is nothing at this address yet." "noindex" > "$d/404.html"
    cp "$HERE/placeholder.css" "$HERE/favicon.svg" "$d/"
    printf 'User-agent: *\nDisallow: /\n' > "$d/robots.txt"
done
echo "placeholders rendered into $OUT"
