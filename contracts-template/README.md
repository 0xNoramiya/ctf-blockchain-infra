# Contract templates

Two starting points for new challenges. Both expose `isSolved(address) view returns (bool)` — the only ABI the backend cares about.

| Template | When to use |
|---|---|
| `single-instance/` | One contract for everyone. Backend may issue authorization signatures. |
| `per-player/` | Each player calls `spawn()` to get an isolated instance. |

## Workflow

```bash
cd single-instance         # or per-player
forge install foundry-rs/forge-std
forge build

export DEPLOYER_KEY=0x...your funded key
export SIGNER_ADDRESS=0x...wallet that signs receipts   # single-instance only
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast
```

Take the printed `target` address and paste it into `backend/challenges.json`.

## Adding your own bug

1. Edit `src/Challenge.sol` (or `src/Factory.sol`) — add storage, functions, the broken behavior you want players to find.
2. Implement `_check(player)` or `Instance._check()` so it returns `true` only after the player has exploited the bug.
3. Re-run `forge build` and re-deploy.

Both templates intentionally start with `_check()` returning `false` — a fresh, un-modified template will never release a flag.
