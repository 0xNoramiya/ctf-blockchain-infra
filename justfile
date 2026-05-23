# One-command ops shortcuts. Install just with: cargo install just,
# brew install just, or apt install just. Run `just` for the menu.

set shell := ["bash", "-c"]
set dotenv-load := true

backend := "backend"
frontend := "frontend"
compose := "docker compose"
admin_url := env_var_or_default("ADMIN_URL", "http://127.0.0.1:8080")
admin_token := env_var_or_default("ADMIN_TOKEN", "")

# Default — list recipes.
default:
    @just --list

# --- local dev (no docker) ---

# One-command demo: anvil + 3 example contracts + backend with mounted frontend.
# Open http://127.0.0.1:8787 after this returns.
demo:
    bash scripts/demo.sh

# Stop the running demo.
demo-stop:
    bash scripts/demo.sh stop

# Show what the demo has running.
demo-status:
    bash scripts/demo.sh status

# Install backend deps.
install:
    cd {{backend}} && npm install

# Run the backend in dev mode (foreground, watch logs).
dev:
    cd {{backend}} && node --watch server.js

# Run backend unit tests (node --test, no extra deps).
test:
    cd {{backend}} && npm test

# --- docker compose ---

# Bring up the whole stack with rebuild.
up:
    {{compose}} up -d --build

# Stop everything.
down:
    {{compose}} down

# Tail backend logs.
logs:
    {{compose}} logs -f backend

# Restart just the backend (after editing .env or challenges.json).
restart:
    {{compose}} restart backend

# Rebuild the frontend image (after editing static files).
rebuild-frontend:
    {{compose}} build frontend && {{compose}} up -d frontend

# --- backend admin ---

# Hot-reload the manifest without restarting.
reload:
    @[ -n "{{admin_token}}" ] || (echo "ADMIN_TOKEN not set" >&2; exit 1)
    curl -sX POST {{admin_url}}/api/admin/manifest/reload \
        -H "Authorization: Bearer {{admin_token}}" | jq

# List active private-anvil instances.
instances:
    @[ -n "{{admin_token}}" ] || (echo "ADMIN_TOKEN not set" >&2; exit 1)
    curl -s {{admin_url}}/api/admin/instances \
        -H "Authorization: Bearer {{admin_token}}" | jq

# Drain every private-anvil instance.
kill-all:
    @[ -n "{{admin_token}}" ] || (echo "ADMIN_TOKEN not set" >&2; exit 1)
    curl -sX POST {{admin_url}}/api/admin/instances/kill-all \
        -H "Authorization: Bearer {{admin_token}}" | jq

# Fire a synthetic webhook event for receiver testing.
webhook-test:
    @[ -n "{{admin_token}}" ] || (echo "ADMIN_TOKEN not set" >&2; exit 1)
    curl -sX POST {{admin_url}}/api/admin/webhook/test \
        -H "Authorization: Bearer {{admin_token}}" \
        -H "Content-Type: application/json" \
        -d '{"event":"solve.first","challenge":"test","player":"0x0000000000000000000000000000000000000001","solved":true}' \
        | jq

# Dump backend metrics.
metrics:
    curl -s {{admin_url}}/metrics

# --- contracts ---

# Build every contract template + example. Used by CI matrix locally.
forge-build-all:
    for d in contracts-template/single-instance contracts-template/per-player contracts-template/private-anvil contracts-template/koth examples/signature-replay examples/vault-inflation examples/koth-frozen-king examples/eip712-replay examples/oracle-manipulation; do \
      echo "==> $$d"; \
      (cd $$d && forge install foundry-rs/forge-std 2>/dev/null; forge build) || exit 1; \
    done

# Run every forge test that exists.
forge-test-all:
    for d in contracts-template/single-instance contracts-template/per-player contracts-template/private-anvil contracts-template/koth examples/signature-replay examples/vault-inflation examples/koth-frozen-king examples/eip712-replay examples/oracle-manipulation; do \
      echo "==> $$d"; \
      (cd $$d && forge test) || exit 1; \
    done

# Rewrite Solidity formatting across every contract dir.
fmt:
    for d in contracts-template/single-instance contracts-template/per-player contracts-template/private-anvil contracts-template/koth examples/signature-replay examples/vault-inflation examples/koth-frozen-king examples/eip712-replay examples/oracle-manipulation; do \
      echo "==> $$d"; \
      DIRS="src script"; [ -d $$d/test ] && DIRS="$$DIRS test"; \
      (cd $$d && forge fmt $$DIRS) || exit 1; \
    done

# Check formatting without rewriting (matches CI).
fmt-check:
    for d in contracts-template/single-instance contracts-template/per-player contracts-template/private-anvil contracts-template/koth examples/signature-replay examples/vault-inflation examples/koth-frozen-king examples/eip712-replay examples/oracle-manipulation; do \
      echo "==> $$d"; \
      DIRS="src script"; [ -d $$d/test ] && DIRS="$$DIRS test"; \
      (cd $$d && forge fmt --check $$DIRS) || exit 1; \
    done

# --- docs ---

# Serve docs locally at 127.0.0.1:8000.
docs:
    cd docs && pip install -q -r requirements.txt && mkdocs serve

# Build the docs site to docs/_site for spot-checking.
docs-build:
    cd docs && pip install -q -r requirements.txt && mkdocs build --strict

# Full E2E smoke: anvil + backend + every example's solver.
# Requires forge, cast, anvil, node, jq, curl on PATH.
e2e:
    bash scripts/e2e-smoke.sh

# Build a player-distributable zip for each example into dist/.
dist:
    python3 scripts/build-dist.py

# Drip Sepolia ETH to a list of player addresses (CSV or one-per-line).
#   FAUCET_KEY=0x... just seed wallets.csv
seed FILE:
    node scripts/seed-faucet.js {{FILE}}
