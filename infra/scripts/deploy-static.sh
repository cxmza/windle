#!/bin/bash
# Atomic static deploy on the server.
#   deploy-static.sh <site> <src-dir>     copy a built dist into releases/<ts>/<site>, precompress, flip
#   deploy-static.sh --rollback <site>    point current/<site> at the previous release
#   deploy-static.sh --list <site>        show releases (* = live)
# Sites: web (www) | app | auth (oauth) | docs | cdn.
#
# Layout: /opt/windle/releases/<UTC ts>/<site>/ ; /opt/windle/current/<site> is a RELATIVE symlink
# (../releases/<ts>/<site>) so it resolves both on the host and inside the imgproxy container.
# The flip is rename(2) of a fresh symlink over the old one: atomic, no window where the path is missing.
# The last 5 releases per site are kept.
set -euo pipefail

ROOT=/opt/windle
KEEP=5
SITES="web app auth docs cdn"

die() { echo "deploy-static: $*" >&2; exit 1; }
valid_site() { case " $SITES " in *" $1 "*) ;; *) die "unknown site '$1' (one of: $SITES)";; esac; }
releases_of() { ls -1d "$ROOT"/releases/*/"$1" 2>/dev/null | sort -r; }
live_of() { readlink -f "$ROOT/current/$1" 2>/dev/null || true; }

flip() { # <site> <release-dir (absolute)>
    local site="$1" target="$2" rel
    rel="../releases/$(basename "$(dirname "$target")")/$site"
    ln -s "$rel" "$ROOT/current/.$site.next"
    mv -T "$ROOT/current/.$site.next" "$ROOT/current/$site"
    echo "live: $site -> $rel"
}

exec 9> /run/windle-deploy.lock
flock -w 60 9 || die "another deploy is running"

case "${1:-}" in
  --list)
    site="${2:?site}"; valid_site "$site"; live="$(live_of "$site")"
    releases_of "$site" | while read -r r; do [ "$r" = "$live" ] && echo "* $r" || echo "  $r"; done
    exit 0 ;;
  --rollback)
    site="${2:?site}"; valid_site "$site"; live="$(live_of "$site")"
    prev="$(releases_of "$site" | awk -v live="$live" 'found {print; exit} $0 == live {found=1}')"
    [ -n "$prev" ] || die "no release older than the live one for $site"
    flip "$site" "$prev"
    exit 0 ;;
esac

site="${1:?usage: deploy-static.sh <site> <src-dir>}"; src="${2:?usage: deploy-static.sh <site> <src-dir>}"
valid_site "$site"
[ -f "$src/index.html" ] || die "$src/index.html missing - refusing to deploy an incomplete build"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$ROOT/releases/$ts/$site"
[ -e "$dest" ] && die "$dest already exists"
mkdir -p "$dest"
rsync -a --delete --exclude='*.br' --exclude='*.gz' "$src/" "$dest/"

if [ "$site" = cdn ]; then
    /opt/windle/bin/render-cdn.sh "$dest"
fi

# Precompress text assets once, at max level, for gzip_static / brotli_static.
find "$dest" -type f -size +255c \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.mjs' \
    -o -name '*.json' -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' -o -name '*.webmanifest' \
    -o -name '*.wasm' -o -name '*.ttf' -o -name '*.otf' \) -print0 |
  while IFS= read -r -d '' f; do
      gzip -9 -n -k -f "$f"
      brotli -q 11 -k -f "$f"
      touch -r "$f" "$f.gz" "$f.br"
  done

chown -R root:root "$dest"
chmod -R u=rwX,go=rX "$dest"
chmod 755 "$ROOT/releases/$ts"

flip "$site" "$dest"

# Prune: keep the newest $KEEP for this site, never the live one.
live="$(live_of "$site")"
releases_of "$site" | tail -n +$((KEEP + 1)) | while read -r old; do
    [ "$old" = "$live" ] && continue
    rm -rf -- "$old"
    rmdir --ignore-fail-on-non-empty -- "$(dirname "$old")"
done
