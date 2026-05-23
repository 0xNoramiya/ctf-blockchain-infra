#!/usr/bin/env bash
# Opinionated one-shot installer for the CTF stack on a fresh Debian/Ubuntu VPS.
#
#   sudo ./install.sh
#
# What it does:
#   1. Installs node 20 + nginx + ufw + jq.
#   2. Creates a `ctf` system user, lays down /opt/ctf/{backend,frontend}.
#   3. Copies the repo's backend, frontend, deploy assets into /opt/ctf.
#   4. Installs the systemd unit, opens port 8080 to Cloudflare only.
#   5. Leaves /opt/ctf/backend/.env at chmod 600 root:root for you to edit.
#
# Re-running is safe (idempotent).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER=ctf
APP_DIR=/opt/ctf
NGINX_PORT=${NGINX_PORT:-8080}

echo "==> installing system packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw nginx jq

if ! command -v node >/dev/null || ! node -v | grep -qE '^v(2[0-9])\.'; then
  echo "==> installing node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  echo "==> creating user ${APP_USER}"
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> laying down ${APP_DIR}"
mkdir -p "${APP_DIR}/backend" "${APP_DIR}/frontend/dist"

rsync -a --delete \
  --exclude node_modules --exclude .env \
  "${REPO_ROOT}/backend/" "${APP_DIR}/backend/"
rsync -a --delete \
  "${REPO_ROOT}/frontend/" "${APP_DIR}/frontend/"

if [[ ! -f "${APP_DIR}/backend/.env" ]]; then
  cp "${REPO_ROOT}/backend/.env.example" "${APP_DIR}/backend/.env"
  chmod 600 "${APP_DIR}/backend/.env"
  chown root:root "${APP_DIR}/backend/.env"
  echo "==> wrote ${APP_DIR}/backend/.env from example (edit it before starting)"
fi

if [[ ! -f "${APP_DIR}/backend/challenges.json" ]]; then
  cp "${REPO_ROOT}/backend/challenges.example.json" "${APP_DIR}/backend/challenges.json"
  echo "==> wrote ${APP_DIR}/backend/challenges.json from example (edit it before starting)"
fi

echo "==> installing backend deps"
( cd "${APP_DIR}/backend" && npm install --omit=dev )

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/backend" "${APP_DIR}/frontend"
chmod 600 "${APP_DIR}/backend/.env"
chown root:root "${APP_DIR}/backend/.env"

echo "==> installing systemd unit"
cp "${REPO_ROOT}/deploy/systemd/ctf-backend.service" /etc/systemd/system/ctf-backend.service
systemctl daemon-reload
systemctl enable ctf-backend.service

echo "==> installing nginx vhost"
sed "s/listen 8080;/listen ${NGINX_PORT};/; s/listen \[::\]:8080;/listen [::]:${NGINX_PORT};/" \
  "${REPO_ROOT}/deploy/nginx/site.conf" > /etc/nginx/sites-available/ctf.conf
ln -sf /etc/nginx/sites-available/ctf.conf /etc/nginx/sites-enabled/ctf.conf
nginx -t
systemctl reload nginx || systemctl restart nginx

echo "==> applying Cloudflare-only firewall to port ${NGINX_PORT}"
PORT="${NGINX_PORT}" bash "${REPO_ROOT}/deploy/cloudflare/ufw-allow-cloudflare.sh"
ufw --force enable

cat <<EOF

==> install complete.

next steps:
  1. edit ${APP_DIR}/backend/.env        (set RPC_URL, FLAG_*, SIGNER_KEY_* values)
  2. edit ${APP_DIR}/backend/challenges.json   (paste your deployed contract addresses)
  3. systemctl start ctf-backend.service
  4. systemctl status ctf-backend.service
  5. point Cloudflare DNS at this server, add an Origin Rule overriding
     port to ${NGINX_PORT}, then run a real-IP filter test:
       curl -I https://your-domain.example/api/health

EOF
