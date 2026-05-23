#!/usr/bin/env bash
# Usage: ./scripts/demo.sh [start|stop|status]

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="${SCRATCH:-/tmp/ctf-demo}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

RPC_URL="http://${ANVIL_HOST}:${ANVIL_PORT}"
BACKEND_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"

# anvil --mnemonic "test test test ..." keys.
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SIGNER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
SIGNER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
PLAYER_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
PLAYER_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
ok()    { printf "\033[32m✓\033[0m %s\n" "$*"; }
note()  { printf "\033[36m→\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m!\033[0m %s\n" "$*"; }
die()   { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit "${2:-1}"; }

cmd_stop() {
  local stopped=0
  for f in backend anvil; do
    local pid_file="$SCRATCH/$f.pid"
    if [[ -f "$pid_file" ]] && kill "$(cat "$pid_file")" 2>/dev/null; then
      ok "stopped $f (pid $(cat "$pid_file"))"
      stopped=1
    fi
    rm -f "$pid_file"
  done
  # belt-and-suspenders: kill anything still listening on the demo ports
  if command -v fuser >/dev/null; then
    fuser -k "${ANVIL_PORT}/tcp" "${BACKEND_PORT}/tcp" 2>/dev/null && stopped=1 || true
  fi
  if [[ $stopped -eq 0 ]]; then note "nothing to stop"; fi
}

cmd_status() {
  for f in anvil backend; do
    local pid_file="$SCRATCH/$f.pid"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      ok "$f running (pid $(cat "$pid_file"))"
    else
      warn "$f not running"
    fi
  done
  if [[ -f "$SCRATCH/addrs.env" ]]; then
    echo
    echo "deployed addresses:"
    sed 's/^/  /' "$SCRATCH/addrs.env"
  fi
}

ensure_foundry() {
  if command -v forge >/dev/null && command -v cast >/dev/null && command -v anvil >/dev/null; then
    return
  fi
  # foundry installs to $HOME/.foundry/bin; surface that if it's just not on PATH
  if [[ -x "$HOME/.foundry/bin/forge" ]]; then
    export PATH="$HOME/.foundry/bin:$PATH"
    if command -v forge >/dev/null && command -v cast >/dev/null && command -v anvil >/dev/null; then
      ok "foundry already at \$HOME/.foundry/bin (added to PATH)"
      return
    fi
  fi
  warn "foundry (forge/cast/anvil) not on PATH"
  local install=""
  if [[ "${YES:-}" == "1" ]]; then
    install=y
  else
    read -r -p "install foundry now via foundryup? [Y/n] " install
    install="${install:-y}"
  fi
  if [[ "$install" != "y" && "$install" != "Y" ]]; then
    die "foundry is required — install from https://book.getfoundry.sh/getting-started/installation"
  fi
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
  command -v forge >/dev/null || die "foundryup didn't produce a working forge"
  ok "foundry installed at \$HOME/.foundry/bin"
}

ensure_node_deps() {
  if [[ -d "$REPO_ROOT/backend/node_modules" ]]; then return; fi
  note "installing backend deps"
  (cd "$REPO_ROOT/backend" && npm install --no-audit --no-fund >/dev/null 2>&1)
  ok "backend deps installed"
}

ensure_git_repo() {
  if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then return; fi
  note "initializing git repo (forge install needs one)"
  git -C "$REPO_ROOT" init -q
  git -C "$REPO_ROOT" config user.email demo@local
  git -C "$REPO_ROOT" config user.name demo
  git -C "$REPO_ROOT" add -A
  git -C "$REPO_ROOT" commit -qm "initial demo state"
  ok "git repo initialized"
}

start_anvil() {
  if [[ -f "$SCRATCH/anvil.pid" ]] && kill -0 "$(cat "$SCRATCH/anvil.pid")" 2>/dev/null; then
    ok "anvil already running (pid $(cat "$SCRATCH/anvil.pid"))"
    return
  fi
  note "booting anvil on ${ANVIL_HOST}:${ANVIL_PORT}"
  anvil --host "$ANVIL_HOST" --port "$ANVIL_PORT" \
        --mnemonic "test test test test test test test test test test test junk" \
        --silent > "$SCRATCH/anvil.log" 2>&1 &
  echo $! > "$SCRATCH/anvil.pid"
  for _ in $(seq 1 40); do
    cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1 && { ok "anvil up"; return; }
    sleep 0.2
  done
  die "anvil never came up — see $SCRATCH/anvil.log"
}

deploy() {
  local dir="$1" tag="$2"; shift 2
  bash "$REPO_ROOT/scripts/sync-lib.sh" >/dev/null
  if [[ ! -d "$dir/lib/forge-std" ]]; then
    # Pin forge-std to a version whose Vm cheat-code surface our tests
    # compile against. 1.10.x is the most recent without the
    # expectRevert(string) overload ambiguity.
    (cd "$dir" && forge install foundry-rs/forge-std@v1.10.0 >/dev/null 2>&1) || \
      die "forge install failed in $dir"
  fi
  (cd "$dir" && forge build --silent) || die "forge build failed in $dir"
  local out
  out=$(cd "$dir" && env DEPLOYER_KEY="$DEPLOYER_KEY" SIGNER_ADDRESS="$SIGNER_ADDR" "$@" \
        forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast 2>&1)
  echo "$out" > "$SCRATCH/$tag.deploy.log"
  printf '%s' "$out"
}

deploy_examples() {
  note "deploying signature-replay"
  local sr; sr=$(deploy "$REPO_ROOT/examples/signature-replay" sr)
  SR_POOL=$(echo "$sr"  | awk -F': ' '/Pool:/  {print $2; exit}' | tr -d ' ')
  SR_TOKEN=$(echo "$sr" | awk -F': ' '/Token:/ {print $2; exit}' | tr -d ' ')
  [[ "$SR_POOL"  =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse sigreplay pool"
  ok "signature-replay  pool=$SR_POOL  token=$SR_TOKEN"

  note "deploying vault-inflation"
  local vi; vi=$(deploy "$REPO_ROOT/examples/vault-inflation" vi)
  VI_FACT=$(echo "$vi" | awk -F': ' '/Factory:/ {print $2; exit}' | tr -d ' ')
  [[ "$VI_FACT" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse vaultinf factory"
  ok "vault-inflation   factory=$VI_FACT"

  note "deploying koth-frozen-king"
  local koth; koth=$(deploy "$REPO_ROOT/examples/koth-frozen-king" koth \
    INITIAL_DROP=200000000000000000000 INITIAL_DROP_TO="$PLAYER_ADDR")
  KOTH_BANK=$(echo "$koth"  | awk -F': ' '/Bank:/  {print $2; exit}' | tr -d ' ')
  KOTH_TOKEN=$(echo "$koth" | awk -F': ' '/Token:/ {print $2; exit}' | tr -d ' ')
  [[ "$KOTH_BANK" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "couldn't parse kothfk bank"
  ok "koth-frozen-king  bank=$KOTH_BANK  token=$KOTH_TOKEN"

  cat > "$SCRATCH/addrs.env" <<EOF
SR_POOL=$SR_POOL
SR_TOKEN=$SR_TOKEN
VI_FACT=$VI_FACT
KOTH_BANK=$KOTH_BANK
KOTH_TOKEN=$KOTH_TOKEN
EOF
}

write_backend_config() {
  cat > "$SCRATCH/challenges.json" <<EOF
{
  "site": {
    "title": "ctf-blockchain-infra · local demo",
    "subtitle": "Three on-chain challenges deployed to a local anvil.",
    "footer": "demo @ $(date -u +%FT%TZ)"
  },
  "challenges": [
    {
      "id": "sigreplay",
      "title": "Replay Receipt",
      "category": "smart-contract",
      "description": "A vault releases tokens against a signed receipt from an authorized signer. The signer is glad to issue one to your address. Read the verifier carefully — they may have skipped something every signed message needs.",
      "target": "$SR_POOL",
      "info": [
        { "label": "Pool",   "value": "$SR_POOL",  "kind": "address" },
        { "label": "Token",  "value": "$SR_TOKEN", "kind": "erc20", "symbol": "VLT", "decimals": 18 },
        { "label": "Win at", "value": "balance >= 1000 VLT" }
      ],
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
      "category": "smart-contract",
      "description": "A vault just opened. Its first depositor — a naive contract — holds 1000 USDC and is ready to deposit. You bring 2000 USDC. The vault's share-pricing formula is ERC4626 at its most literal.",
      "target": "$VI_FACT",
      "info": [
        { "label": "Factory", "value": "$VI_FACT", "kind": "address" },
        { "label": "Win at",  "value": "balance >= 2500 USDC AND depositor triggered" }
      ]
    },
    {
      "id": "kothfk",
      "title": "Frozen King",
      "category": "smart-contract",
      "description": "A bank tracks deposit scores; the highest depositor is king. The throne is yours as long as no one outbids you. A subtle bug in withdraw() decides who outbids whom.",
      "target": "$KOTH_BANK",
      "info": [
        { "label": "Bank",   "value": "$KOTH_BANK",  "kind": "address" },
        { "label": "Token",  "value": "$KOTH_TOKEN", "kind": "erc20", "symbol": "KOTH", "decimals": 18 },
        { "label": "Win at", "value": "be the current king" }
      ]
    }
  ]
}
EOF

  cat > "$SCRATCH/.env" <<EOF
RPC_URL=$RPC_URL
CHAIN_ID=31337
HOST=$BACKEND_HOST
PORT=$BACKEND_PORT
CHALLENGES_MANIFEST=$SCRATCH/challenges.json
FRONTEND_PATH=$REPO_ROOT/frontend
INSTANCE_STATE_PATH=$SCRATCH/instances.json
WRITEUPS_PATH=$SCRATCH/writeups.jsonl

FLAG_SIGREPLAY=CTF{s1gn_0nc3_dr41n_f0r3v3r}
FLAG_VAULTINF=CTF{1nfl4t3_th3_p13_4nd_3at_1t_t00}
FLAG_KOTHFK=CTF{fr0z3n_thr0n3}
SIGNER_KEY_SIGREPLAY=$SIGNER_KEY

ADMIN_TOKEN=demo-admin-token
LOG_FORMAT=pretty
EOF
}

start_backend() {
  if [[ -f "$SCRATCH/backend.pid" ]] && kill -0 "$(cat "$SCRATCH/backend.pid")" 2>/dev/null; then
    ok "backend already running (pid $(cat "$SCRATCH/backend.pid"))"
    return
  fi
  note "booting backend on ${BACKEND_HOST}:${BACKEND_PORT}"
  ( cd "$REPO_ROOT/backend" && env $(grep -v '^#' "$SCRATCH/.env" | xargs) node server.js ) \
    > "$SCRATCH/backend.log" 2>&1 &
  echo $! > "$SCRATCH/backend.pid"
  for _ in $(seq 1 40); do
    curl -fsS "$BACKEND_URL/api/health" >/dev/null 2>&1 && { ok "backend up"; return; }
    sleep 0.25
  done
  tail -30 "$SCRATCH/backend.log" >&2
  die "backend never came up — see $SCRATCH/backend.log"
}

next_steps() {
  cat <<EOF

$(bold "demo is live → $BACKEND_URL")

  open $BACKEND_URL in a browser, click "Connect wallet".
  MetaMask will prompt to add "Anvil (local)" (chain id 31337) — approve.

  pre-funded keys (paste into MetaMask → import account):
    deployer  $DEPLOYER_KEY
    signer    $SIGNER_KEY  (the wallet behind /api/sign)
    player    $PLAYER_KEY  (also holds 200 KOTH for kothfk)

  artifacts:
    addresses     $SCRATCH/addrs.env
    manifest      $SCRATCH/challenges.json
    env           $SCRATCH/.env
    anvil log     $SCRATCH/anvil.log
    backend log   $SCRATCH/backend.log

  bottle it up:    ./scripts/demo.sh stop
  watch logs:      tail -f $SCRATCH/backend.log

  admin CLI (token = demo-admin-token):
    export BACKEND=$BACKEND_URL ADMIN_TOKEN=demo-admin-token
    ./bin/ctf-admin health
    ./bin/ctf-admin challenges

EOF
}

cmd_start() {
  mkdir -p "$SCRATCH"
  bold "ctf-blockchain-infra :: local demo"

  for t in node npm curl awk grep git; do
    command -v "$t" >/dev/null || die "missing on PATH: $t"
  done

  ensure_foundry
  ensure_node_deps
  ensure_git_repo
  start_anvil
  deploy_examples
  write_backend_config
  start_backend
  next_steps
}

case "${1:-start}" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  *)      die "usage: $0 [start|stop|status]" ;;
esac
