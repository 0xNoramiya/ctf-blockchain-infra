# examples/oracle-manipulation

Fifth worked example, first one in **private-anvil mode**. A lending
vault values collateral using an AMM's *spot* reserves. The pool is
deep enough that direct manipulation by the player is impractical
without flash loans — but the bug doesn't even require manipulation:
spot-priced lending with no caps means *anyone* with enough collateral
can drain the borrowable supply.

## The bug

```solidity
function borrow(uint256 amount) external {
    uint256 priceAinB = amm.priceAinB();                  // 🚨 spot
    uint256 maxBorrow = collateral[msg.sender] * priceAinB / 1e18;
    require(debt[msg.sender] + amount <= maxBorrow, "undercollateralized");
    debt[msg.sender] += amount;
    require(tokenB.transfer(msg.sender, amount), "tfB");
}
```

Two problems:

1. **Spot price as oracle.** A single AMM's `reserveB / reserveA` is
   manipulable in one transaction. A player with a flash loan can push
   `priceAinB` arbitrarily high right before borrowing, then push it
   back after. The vault prices the manipulated state as ground truth.
2. **No utilization cap.** Even without manipulation, the vault lets a
   single depositor borrow against their full collateral × spot value.
   Combine that with a generous initial endowment of A, and the
   exploit collapses to "deposit, borrow, done".

Mitigations:

- **TWAP** oracles (Uniswap V2's `price0CumulativeLast`, the V3
  observation buffer, Chainlink feed aggregation).
- Per-block and per-user utilization caps.
- Disallow same-block deposit + borrow (or charge a discount factor).
- Multi-source price aggregation; reject borrows when sources disagree
  by > N%.

## Setup

Each player gets:

- 1,000,000 tokenA in their wallet
- 1 tokenB in their wallet
- A vault holding 1,000,000 tokenB
- An AMM seeded with 100,000 / 100,000 (spot price 1.0)

Win threshold: **balanceOf(player, B) ≥ 100,000**.

## Honest solve

```
TX 1  tokenA.approve(vault, max)
TX 2  vault.deposit(1_000_000 A)              maxBorrow = 1_000_000 B
TX 3  vault.borrow(100_000 B)                 player B balance = 100_001
```

That's it. The bug is in the loan-to-value formula, not in any clever
manipulation.

## Hardened variant — leave as exercise

To force actual oracle manipulation, tighten the deploy:

- Reduce player A to 1,000.
- Increase win threshold to 100,000 B.
- At spot price 1.0 the honest borrow caps at 1,000 B — needs ≥ 100×
  price inflation to win.
- Players then need access to a flash loan or a secondary pool to push
  `priceAinB` up before borrowing.

The skeleton above is intentionally beatable without those mechanics —
walk-through-friendly for newcomers. Drop them in for a hard variant.

## Build & ship

```bash
cd examples/oracle-manipulation
forge install foundry-rs/forge-std
forge build
forge test -vvv     # four tests, including the price-shift demonstration

# Build the per-player image:
docker build -t ghcr.io/your-org/ctf-oracle:1.0 .
docker push ghcr.io/your-org/ctf-oracle:1.0
```

The challenge image embeds the contracts; the launcher passes
`PLAYER` and (optionally) `FORK_URL` / `FORK_BLOCK_NUMBER`.

Register in `backend/challenges.json`:

```bash
sudo -e /opt/ctf/backend/challenges.json
# paste challenges-entry.json, replace image with your tag
ctf-admin reload
```

## Smoke test

```bash
# Spawn an instance from the UI first, OR:
curl -sX POST "$BACKEND/api/launch/oracle?address=$ME" | jq

PLAYER_KEY=0x...$ME \
BACKEND=https://ctf.example.com \
CHALLENGE=oracle \
node solver/solve.js
```

## What this example demonstrates

| Surface | Where |
|---|---|
| Private-anvil mode | `Dockerfile` + `entrypoint.sh` |
| Per-player container spawn | Backend launcher (set `image` in manifest) |
| Multi-contract per-spawn deploy | `script/Deploy.s.sol` |
| `CTF_META` with extras (amm/token addresses surfaced in UI) | bottom of `Deploy.s.sol` |
| Spot-price oracle anti-pattern | `LendingVault.borrow` |
| Fork-mode hook (FORK_URL passthrough) | `entrypoint.sh` |
