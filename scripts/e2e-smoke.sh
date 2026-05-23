#!/usr/bin/env bash
# Usage: scripts/e2e-smoke.sh

set -euo pipefail

ANVIL_PORT="${ANVIL_PORT:-8545}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
SCRATCH="${SCRATCH:-/tmp/ctf-e2e}"
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

RPC_URL="http://127.0.0.1:${ANVIL_PORT}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"

DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
SIGNER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
SIGNER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PLAYER_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
PLAYER_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

mkdir -p "$SCRATCH"
ANVIL_LOG="$SCRATCH/anvil.log"
BACKEND_LOG="$SCRATCH/backend.log"

cleanup() {
  local code=$?
  echo "--- cleanup ---"
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${ANVIL_PID:-}" ]]   && kill "$ANVIL_PID"   2>/dev/null || true
  echo "logs preserved under $SCRATCH"
  exit "$code"
}
trap cleanup EXIT INT TERM

ok()   { printf "\033[32m✓\033[0m %s\n" "$*"; }
note() { printf "\033[36m→\033[0m %s\n" "$*"; }
die()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit "${2:-2}"; }

need() { command -v "$1" >/dev/null || die "missing on PATH: $1" 1; }
for t in forge cast anvil node jq curl; do need "$t"; done

note "starting anvil on :$ANVIL_PORT"
anvil --host 127.0.0.1 --port "$ANVIL_PORT" \
      --mnemonic "test test test test test test test test test test test junk" \
      --silent > "$ANVIL_LOG" 2>&1 &
ANVIL_PID=$!
for i in $(seq 1 40); do
  cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1 && break
  sleep 0.2
done
cast block-number --rpc-url "$RPC_URL" >/dev/null || die "anvil never came up"
ok "anvil up"

deploy_example() {
  local dir="$1" tag="$2"; shift 2
  note "$tag: sync lib + forge install + build"
  bash "$REPO_ROOT/scripts/sync-lib.sh" >/dev/null
  (cd "$dir" && forge install foundry-rs/forge-std@v1.10.0 >/dev/null 2>&1 || true)
  (cd "$dir" && forge build --silent)

  note "$tag: deploy"
  local out
  out=$(cd "$dir" && env DEPLOYER_KEY="$DEPLOYER_KEY" SIGNER_ADDRESS="$SIGNER_ADDR" "$@" \
        forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast 2>&1)
  echo "$out" > "$SCRATCH/$tag.deploy.log"
  printf '%s' "$out"
}

SR_OUT=$(deploy_example "$REPO_ROOT/examples/signature-replay" sr)
SR_POOL=$(echo "$SR_OUT" | awk -F': ' '/Pool: / {print $2; exit}' | tr -d ' ')
SR_TOKEN=$(echo "$SR_OUT" | awk -F': ' '/Token:/ {print $2; exit}' | tr -d ' ')
[[ "$SR_POOL"  =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse signature-replay pool addr"
ok "signature-replay deployed: pool=$SR_POOL"

VI_OUT=$(deploy_example "$REPO_ROOT/examples/vault-inflation" vi)
VI_FACT=$(echo "$VI_OUT" | awk -F': ' '/Factory:/ {print $2; exit}' | tr -d ' ')
[[ "$VI_FACT" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse vault-inflation factory addr"
ok "vault-inflation deployed: factory=$VI_FACT"

KOTH_OUT=$(deploy_example "$REPO_ROOT/examples/koth-frozen-king" koth \
  INITIAL_DROP=200000000000000000000 INITIAL_DROP_TO="$PLAYER_ADDR")
KOTH_BANK=$(echo "$KOTH_OUT" | awk -F': ' '/Bank: / {print $2; exit}' | tr -d ' ')
KOTH_TOKEN=$(echo "$KOTH_OUT" | awk -F': ' '/Token:/ {print $2; exit}' | tr -d ' ')
[[ "$KOTH_BANK" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse koth bank addr"
ok "koth-frozen-king deployed: bank=$KOTH_BANK"

mkdir -p "$SCRATCH/backend"
cat > "$SCRATCH/backend/challenges.json" <<EOF
{
  "site": { "title": "E2E", "subtitle": "smoke test" },
  "challenges": [
    {
      "id": "sigreplay",
      "title": "Replay Receipt",
      "description": "smoke",
      "target": "$SR_POOL",
      "signer": {
        "enabled": true,
        "label": "Get receipt",
        "type": "personal-sign",
        "template": [
          { "type": "string",  "value": "Withdraw" },
          { "type": "address", "value": "\$player" },
          { "type": "uint256", "value": "100000000000000000000" }
        ]
      }
    },
    {
      "id": "vaultinf",
      "title": "First Slice",
      "description": "smoke",
      "target": "$VI_FACT"
    },
    {
      "id": "kothfk",
      "title": "Frozen King",
      "description": "smoke",
      "target": "$KOTH_BANK"
    }
  ]
}
EOF

cat > "$SCRATCH/backend/.env" <<EOF
RPC_URL=$RPC_URL
CHAIN_ID=31337
HOST=127.0.0.1
PORT=$BACKEND_PORT
CHALLENGES_MANIFEST=$SCRATCH/backend/challenges.json

FLAG_SIGREPLAY=CTF{e2e_signature_replay}
FLAG_VAULTINF=CTF{e2e_vault_inflation}
FLAG_KOTHFK=CTF{e2e_frozen_king}
SIGNER_KEY_SIGREPLAY=$SIGNER_KEY
EOF

note "installing backend deps"
( cd "$REPO_ROOT/backend" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )

note "installing examples deps (ethers for solvers)"
( cd "$REPO_ROOT/examples" && npm install --no-audit --no-fund >/dev/null 2>&1 )

note "starting backend on :$BACKEND_PORT"
( cd "$REPO_ROOT/backend" && env $(grep -v '^#' "$SCRATCH/backend/.env" | xargs) node server.js ) \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
for i in $(seq 1 40); do
  curl -fsS "$BACKEND_URL/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done
curl -fsS "$BACKEND_URL/api/health" | jq -e '.ok == true' >/dev/null \
  || { tail -30 "$BACKEND_LOG"; die "backend never came up"; }
ok "backend up"

run_solver() {
  local tag="$1" expected="$2" challenge="$3"; shift 3
  note "$tag: running solver"
  if ! out=$(env BACKEND="$BACKEND_URL" CHALLENGE="$challenge" RPC_URL="$RPC_URL" \
              PLAYER_KEY="$PLAYER_KEY" "$@" \
              node "$REPO_ROOT/examples/$tag/solver/solve.js" 2>&1); then
    echo "$out"
    die "$tag: solver failed"
  fi
  echo "$out" | tail -5
  if ! echo "$out" | grep -q "flag: ${expected}"; then
    die "$tag: expected flag '${expected}' not in solver output" 3
  fi
  ok "$tag: flag matches"
}

run_solver signature-replay  "CTF{e2e_signature_replay}"  sigreplay   POOL="$SR_POOL"
run_solver vault-inflation   "CTF{e2e_vault_inflation}"   vaultinf    FACTORY="$VI_FACT"
run_solver koth-frozen-king  "CTF{e2e_frozen_king}"       kothfk      BANK="$KOTH_BANK" TOKEN="$KOTH_TOKEN" BUMP_AMOUNT=100

ok "all three solvers redeemed their flags"
echo
echo "--- /metrics tail ---"
curl -s "$BACKEND_URL/metrics" | grep -E '^ctf_(solves|launches|webhook)' || true
