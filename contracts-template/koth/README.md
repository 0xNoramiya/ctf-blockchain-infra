# KOTH template

King-of-the-hill: one shared contract, many players competing on shared
state. `isSolved(player)` returns true only for the current king.
Dethrone someone, your score flips solved; get dethroned, you flip back.

Pair with the [scoreboard webhook](../../docs/docs/operations/webhook.md)
so every flip fires an event your scoreboard can score on first-blood
basis.

## Workflow

```bash
cd contracts-template/koth
forge install foundry-rs/forge-std
forge build

export DEPLOYER_KEY=0x...funded
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

Register in `backend/challenges.json`:

```json
{
  "id": "koth1",
  "title": "Last One Standing",
  "mode": "shared",
  "target": "0xDeployedKoth",
  "info": [
    { "label": "Type", "value": "King of the hill" }
  ]
}
```

Pair with `WEBHOOK_URL` in `backend/.env` to broadcast each crown event.

## Adapting

Replace `claim()` with your own scoring mechanism. Examples:

| Mechanism | How |
|---|---|
| Highest balance wins | Track `score[msg.sender]`; promote king when score exceeds `kingScore`. |
| First to N points | Same, but `_crown()` only fires after `score[msg.sender] >= TARGET`. |
| Time-locked seat | Require `block.timestamp >= heldUntil[king]` before allowing dethronement. |
| Pay-to-play | Charge ETH/token per `claim()`, optionally distribute to dethroned king. |

The `Koth` base only enforces the `isSolved(player) == (player == king)`
invariant. Everything else is yours.
