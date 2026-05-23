#!/usr/bin/env bash
# Restrict the nginx public port so only Cloudflare's edge can reach it.
# Pair with a proxied DNS record + an Origin Rule that points CF at this
# port. The origin port (default 8080 here) should match nginx/site.conf.
#
# Usage: PORT=8080 sudo ./ufw-allow-cloudflare.sh
#
# Re-run periodically (e.g. weekly cron) — Cloudflare's IP list does change.
set -euo pipefail

PORT="${PORT:-8080}"
PROTO="${PROTO:-tcp}"

if ! command -v ufw >/dev/null; then
  echo "ufw not installed" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

echo "Resetting ufw rules for port ${PORT}/${PROTO}..."
ufw status numbered | awk -v p="${PORT}/${PROTO}" '$0 ~ p {match($0,/\[ *([0-9]+) *\]/,a); if (a[1]) print a[1]}' \
  | sort -rn | xargs -I{} ufw --force delete {} >/dev/null 2>&1 || true

fetch() {
  curl -fsSL "$1" || { echo "failed to fetch $1" >&2; exit 1; }
}

echo "Fetching Cloudflare CIDRs..."
V4=$(fetch https://www.cloudflare.com/ips-v4)
V6=$(fetch https://www.cloudflare.com/ips-v6)

count=0
for cidr in $V4 $V6; do
  ufw allow from "${cidr}" to any port "${PORT}" proto "${PROTO}" comment "cloudflare"
  count=$((count + 1))
done

echo "Added ${count} Cloudflare allow rules for port ${PORT}/${PROTO}."
echo "Make sure ufw default deny is set and the port is otherwise closed."
ufw status verbose | grep -F "${PORT}/${PROTO}"
