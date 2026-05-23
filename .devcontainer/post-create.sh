#!/usr/bin/env bash
# Runs once after the devcontainer is built.
#  - Installs foundryup + foundry binaries (forge, cast, anvil).
#  - Installs backend npm deps.
#  - Pre-installs forge-std per contracts dir so `forge build` is instant
#    after first open.
#  - Symlinks bin/ctf-admin into ~/.local/bin so it's on PATH.
set -euo pipefail

if ! command -v forge >/dev/null; then
  echo "==> installing foundryup"
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
fi

echo "==> installing backend deps"
( cd backend && npm install --no-audit --no-fund )

echo "==> pre-fetching forge-std for each contract dir"
for d in contracts-template/single-instance contracts-template/per-player \
         contracts-template/private-anvil contracts-template/koth \
         examples/signature-replay examples/vault-inflation \
         examples/koth-frozen-king examples/eip712-replay \
         examples/oracle-manipulation; do
  [ -f "$d/foundry.toml" ] || continue
  ( cd "$d" && forge install foundry-rs/forge-std >/dev/null 2>&1 || true )
done

mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/bin/ctf-admin" "$HOME/.local/bin/ctf-admin"

cat <<EOF

==> devcontainer ready.

Common next steps:
  just            # menu of recipes
  just dev        # run the backend on :8787
  just up         # docker compose up
  just e2e        # full end-to-end smoke
  just test       # backend unit tests
  just fmt-check  # forge fmt --check across the codebase

CLI is available as: ctf-admin help
EOF
