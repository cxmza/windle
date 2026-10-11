#!/bin/sh
# certbot deploy hook: runs after every successful renewal. Reload only if the config is valid.
set -e
nginx -t -q
systemctl reload nginx
