#!/bin/bash
# Refreshes Cloudflare's edge networks for nginx real_ip (global snippet included from nginx.conf).
#
# Why: every windle domain is proxied by Cloudflare. Without this, access logs, rate limits and the api
# see Cloudflare's address instead of the visitor's. Why a network list and not "trust the header":
# CF-Connecting-IP is a plain header anyone can send to the (publicly known) origin IP; it may only be
# trusted when the TCP peer is provably Cloudflare.
#
# The file is replaced atomically and kept only if `nginx -t` passes: a truncated list would break nginx
# on the next reload. Only the network list is compared, so an unchanged list does not trigger a reload.
set -euo pipefail

OUT=/etc/nginx/snippets/cloudflare-realip.conf
TMP="$(mktemp)"
trap 'rm -f "$TMP" "$TMP.body"' EXIT

for url in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    curl -fsSL --max-time 20 "$url" | while IFS= read -r cidr; do
        [ -n "$cidr" ] && printf 'set_real_ip_from %s;\n' "$cidr"
    done
done > "$TMP.body"
printf 'real_ip_header CF-Connecting-IP;\n' >> "$TMP.body"

# Fewer than 10 networks is almost certainly a truncated response: keep the old list.
if [ "$(grep -c set_real_ip_from "$TMP.body")" -lt 10 ]; then
    echo "$(date -Is) cf-realip: suspiciously few networks, keeping the current list" >&2
    exit 1
fi

if [ -f "$OUT" ] && diff -q <(grep -v '^#' "$OUT") "$TMP.body" > /dev/null; then
    echo "$(date -Is) cf-realip: unchanged"
    exit 0
fi

{ printf '# Generated %s by /opt/windle/bin/cf-realip-update.sh. Do not edit by hand.\n' "$(date -Is)"; cat "$TMP.body"; } > "$TMP"
[ -f "$OUT" ] && cp -p "$OUT" "$OUT.bak"
install -m 600 -o root -g root "$TMP" "$OUT"

if nginx -t > /dev/null 2>&1; then
    systemctl reload nginx
    echo "$(date -Is) cf-realip: list updated, nginx reloaded"
else
    echo "$(date -Is) cf-realip: nginx -t failed, rolling back" >&2
    [ -f "$OUT.bak" ] && mv "$OUT.bak" "$OUT"
    exit 1
fi
