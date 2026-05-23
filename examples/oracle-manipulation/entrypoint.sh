#!/bin/sh
set -eu

: "${PLAYER:?launcher must set PLAYER}"
: "${ANVIL_PORT:=8545}"
: "${ANVIL_HOST:=0.0.0.0}"

MNEMONIC="${MNEMONIC:-test test test test test test test test test test test junk}"

cd /chal

FORK_ARGS=""
if [ -n "${FORK_URL:-}" ]; then
  FORK_ARGS="--fork-url $FORK_URL"
  [ -n "${FORK_BLOCK_NUMBER:-}" ] && FORK_ARGS="$FORK_ARGS --fork-block-number $FORK_BLOCK_NUMBER"
fi

# shellcheck disable=SC2086
anvil --host "$ANVIL_HOST" --port "$ANVIL_PORT" \
      --mnemonic "$MNEMONIC" \
      --accounts 5 --balance 1000 --block-time 1 \
      $FORK_ARGS --silent &
ANVIL_PID=$!

for i in $(seq 1 30); do
  cast block-number --rpc-url "http://127.0.0.1:${ANVIL_PORT}" >/dev/null 2>&1 && break
  sleep 0.5
done

PLAYER="$PLAYER" forge script script/Deploy.s.sol \
  --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
  --broadcast --silent 2>&1 \
  | grep -E '^CTF_META=' \
  | head -1

wait "$ANVIL_PID"
