# examples/signature-replay

End-to-end worked example. A vault holding 10¹⁵ tokens releases them
against signed receipts from an authorized signer. The verifier checks
the signature recovers to the signer and the caller matches the
recipient. The bug: no nonce, no deadline, no consumed flag — one valid
signature is reusable forever.

This example exists so you have a runnable reference for every piece of
the infra: Solidity, forge tests, deploy script, manifest entry,
backend signer, and a solver script. Copy, rename, modify.

## Bug pattern

```solidity
function withdraw(address to, uint256 amount, bytes calldata sig) external {
    require(msg.sender == to, "only recipient");
    bytes32 inner  = keccak256(abi.encodePacked("Withdraw", to, amount));
    bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    require(_recover(digest, sig) == signer, "bad sig");
    require(amount == AUTHORIZED_AMOUNT, "tf");
    require(token.transfer(to, amount), "tf");
}
```

Mitigation (the production fix players should articulate):

- EIP-712 typed data,
- per-address nonce committed to in the digest, **or** a `mapping(bytes32 => bool) consumed` flag.

## Real-world origin

The Taiko TimelockTokenPool H-05 finding on Solodit. Find the original
audit issue for the production diff.

## End-to-end deploy

```bash
cd examples/signature-replay
forge install foundry-rs/forge-std
forge build
forge test -vvv      # all four tests pass

export DEPLOYER_KEY=0x...funded
# The signer is a separate burner. Create one:
SIGNER_KEY=$(cast wallet new --json | jq -r .[0].private_key)
SIGNER=$(cast wallet address --private-key "$SIGNER_KEY")
export SIGNER_ADDRESS="$SIGNER"

forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" --broadcast -vv
```

The script prints the deployed addresses. Wire them in:

```bash
# 1. Backend env (root-only, chmod 600)
cat >> /opt/ctf/backend/.env <<EOF
FLAG_SIGREPLAY=CTF{s1gn_0nc3_dr41n_f0r3v3r}
SIGNER_KEY_SIGREPLAY=$SIGNER_KEY
EOF

# 2. Backend manifest — paste the snippet from challenges-entry.json,
#    replacing the addresses with what the deploy script printed:
sudo -e /opt/ctf/backend/challenges.json

# 3. Reload the backend (via admin endpoint or restart)
curl -sX POST https://ctf.example.com/api/admin/manifest/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Verify it works

```bash
PLAYER_KEY=$(cast wallet new --json | jq -r .[0].private_key)
PLAYER=$(cast wallet address --private-key "$PLAYER_KEY")

# Fund the player with a sliver of testnet ETH (faucet, transfer, etc.)
cast send "$PLAYER" --value 0.01ether \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY"

PLAYER_KEY="$PLAYER_KEY" \
POOL="$DEPLOYED_POOL_ADDRESS" \
BACKEND="https://ctf.example.com" \
CHALLENGE="sigreplay" \
node solver/solve.js
```

End state: player balance ≥ 1000 VLT, backend hands over the flag, the
scoreboard webhook fires `solve.first`.

## Distributing source to players

Players want to read the Solidity. Strip nothing — the bug pattern is
the puzzle. Zip + drop into `frontend/dist/`:

```bash
zip /opt/ctf/frontend/dist/sigreplay.zip src/VaultPool.sol
# MockERC20 ships with the lib already; you can include it for completeness:
zip /opt/ctf/frontend/dist/sigreplay.zip ../../contracts-template/lib/MockERC20.sol
```

The manifest entry references `/dist/sigreplay.zip` already.

## What this example demonstrates

| Piece of the infra | Where you see it |
|---|---|
| Backend signer (personal-sign) | `challenges-entry.json` `signer.template` |
| `isSolved(address)` on a deployed contract | `src/VaultPool.sol::isSolved` |
| Backend flag gating | `FLAG_SIGREPLAY` env, only released on `isSolved == true` |
| Frontend rendering | the `info[]` + `downloads[]` arrays populate the card |
| Forge tests gating CI | `test/VaultPool.t.sol` (replay-to-solve test) |
| Solver-as-doc | `solver/solve.js` reads the API, replays, claims |
