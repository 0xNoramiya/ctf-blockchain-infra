# examples/koth-frozen-king

Third worked example — the KOTH pattern. The bank tracks deposit
scores; the highest depositor is king; `isSolved(player)` is true only
while the player holds the throne. The bug is in `withdraw()`: the
score decrements but `king` and `kingScore` don't update, so a player
who bumps then withdraws stays "king" with a phantom score forever
(until someone bumps *strictly greater* than the recorded kingScore,
which they can't if everyone has the same starting allocation).

Pair with the scoreboard webhook for first-blood + dethrone scoring.
With this challenge, "first blood" is whoever gets the frozen-king
exploit to land first; subsequent solvers can only unseat them by
finding *more* KOTH tokens somewhere (a separate, harder
sub-challenge).

## Bug pattern

```solidity
function withdraw(uint256 amount) external {
    require(score[msg.sender] >= amount, "balance");
    unchecked { score[msg.sender] -= amount; }
    require(token.transfer(msg.sender, amount), "tf");
    // 🚨 missing: if (msg.sender == king) {
    //                kingScore = score[msg.sender];
    //                /* and re-elect if zero */
    //            }
}
```

Mitigations:

- On withdraw by the king, recompute the king from the remaining
  depositors (needs a leaderboard or auxiliary data structure).
- Make withdraw subject to a "must maintain ≥ minScore" invariant.
- Use a different KOTH mechanic where the throne expires on inactivity
  (`heldUntil = block.timestamp + lock`).

## Origin

Pattern hand-built but mirrors a common audit finding shape: state
update in one function (deposit / bump / mint) without a paired
inverse update in the corresponding decrement function. See c4 contest
results for variants in lending / staking protocols where unstake
forgets to update a TVL gauge or reward pointer.

## Exploit walkthrough

```
TX 1  token.approve(bank, max)
TX 2  bank.bump(100)              state: king=me, score=100, kingScore=100
TX 3  bank.withdraw(100)          state: king=me, score=0, kingScore=100 🚨
       ↑ frozen — no other player can dethrone without > 100 KOTH
```

`isSolved(me)` stays true. Until someone finds 101+ tokens, the flag is
gated to your address.

## End-to-end deploy

```bash
cd examples/koth-frozen-king
forge install foundry-rs/forge-std
forge build
forge test -vvv             # five tests, including the frozen-king assertion

export DEPLOYER_KEY=0x...funded
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

You'll also need a faucet contract or organizer-controlled drop that
hands out KOTH tokens — otherwise no one can `bump()` at all. The
simplest implementation: a `Faucet` contract that lets each address
claim N tokens once. Skipped here for brevity; bake one alongside
`Deploy.s.sol` for your event.

## Smoke test

```bash
PLAYER_KEY=0x... \
BANK=0x... \
TOKEN=0x... \
BUMP_AMOUNT=100 \
BACKEND=https://ctf.example.com \
CHALLENGE=kothfk \
node solver/solve.js
```

## What this example demonstrates

| Infra surface | Where you see it |
|---|---|
| `KothBank` exposing `isSolved(player) == (player == king)` | `src/KothBank.sol` |
| Webhook-driven scoring on `solve.flip` (dethrone events) | runs automatically when `WEBHOOK_URL` is set |
| Asymmetric updates as a bug pattern | the missing `kingScore` re-set in `withdraw` |
| Forge tests covering exploit + multiple negative paths | `test/KothBank.t.sol` |
| Realistic exploit script | `solver/solve.js` |
