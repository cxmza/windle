#!/bin/bash
# One Let's Encrypt certificate (cert-name windle.fun) with all seven names, HTTP-01 over webroot.
# Works behind Cloudflare's proxy: on 2026-10-11 CF forwarded http://<name>/.well-known/acme-challenge/
# to this origin on :80 for all seven names and the first issuance passed. Things that would break it:
# a CF redirect/WAF/"Under attack" rule on that path, or HSTS-style redirects at CF before the origin.
# If "Always Use HTTPS" is turned on later, renewal still works once a valid cert exists (LE follows the
# redirect to https, CF reaches the origin on :443) - but verify with `certbot renew --dry-run`.
# Re-running is safe: certbot keeps the existing cert unless it is due or the name list changed (--expand).
set -euo pipefail

DOMAINS=(windle.fun www.windle.fun app.windle.fun api.windle.fun cdn.windle.fun docs.windle.fun oauth.windle.fun)
args=()
for d in "${DOMAINS[@]}"; do args+=(-d "$d"); done

install -d -m 755 /opt/windle/www-acme/.well-known/acme-challenge

certbot certonly --webroot -w /opt/windle/www-acme \
    --cert-name windle.fun "${args[@]}" \
    --key-type ecdsa --elliptic-curve secp256r1 \
    --non-interactive --agree-tos --keep-until-expiring --expand \
    "$@"
