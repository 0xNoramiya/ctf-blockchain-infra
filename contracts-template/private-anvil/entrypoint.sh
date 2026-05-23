#!/bin/sh
# Container entrypoint: start anvil in the background, deploy the
# challenge against it, then exec anvil in the foreground.
set -eu

: "${PLAYER:?launcher must set PLAYER}"
: "${ANVIL_PORT:=8545}"
: "${ANVIL_HOST:=0.0.0.0}"

# Pre-funded test mnemonic — fine for a private, throwaway container.
MNEMONIC="${MNEMONIC:-test test test test test test test test test test test junk}"

cd /chal

# Optional mainnet-fork mode. Set FORK_URL (and optionally
# FORK_BLOCK_NUMBER) to fork an existing chain at startup; the deploy
# script can then interact with already-deployed real contracts.
FORK_ARGS=""
if [ -n "${FORK_URL:-}" ]; then
  FORK_ARGS="--fork-url $FORK_URL"
  if [ -n "${FORK_BLOCK_NUMBER:-}" ]; then
    FORK_ARGS="$FORK_ARGS --fork-block-number $FORK_BLOCK_NUMBER"
  fi
fi

# shellcheck disable=SC2086
anvil \
  --host "$ANVIL_HOST" \
  --port "$ANVIL_PORT" \
  --mnemonic "$MNEMONIC" \
  --accounts 5 \
  --balance 1000 \
  --block-time 1 \
  $FORK_ARGS \
  --silent &
ANVIL_PID=$!

# wait until anvil is reachable
for i in $(seq 1 30); do
  if cast block-number --rpc-url "http://127.0.0.1:${ANVIL_PORT}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

PLAYER="$PLAYER" forge script script/Deploy.s.sol \
  --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
  --broadcast \
  --silent \
  2>&1 \
  | grep -E '^CTF_META=' \
  | head -1

# anvil keeps running so the launcher / player can RPC it
wait "$ANVIL_PID"
