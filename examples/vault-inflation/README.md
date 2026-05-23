# examples/vault-inflation

Second end-to-end example, this one wired against the per-player factory
template. ERC4626 first-depositor inflation — a player deposits 1 wei,
donates a chunk of USDC directly to the vault to inflate the share
price, triggers the victim's deposit (which mints zero shares due to
floor division), then withdraws their single share to sweep everything.

## Bug pattern

Two interacting flaws in `Vault.sol`:

```solidity
function totalAssets() public view returns (uint256) {
    return asset.balanceOf(address(this));        // 🚨 live balance, donations affect it
}

function deposit(uint256 amount) external returns (uint256 shares) {
    uint256 ts = totalShares;
    if (ts == 0) {
        shares = amount;
    } else {
        shares = amount * ts / totalAssets();     // 🚨 floor division, no require(shares > 0)
    }
    asset.transferFrom(msg.sender, address(this), amount);
    balanceOf[msg.sender] += shares;
    totalShares = ts + shares;
}
```

Mitigations (production fixes):

- Track `totalAssets` in storage, not via `balanceOf`.
- Add `require(shares > 0, "no shares minted")`.
- Use OpenZeppelin's ERC4626 with the virtual-shares/decimal-offset
  protection (the modern standard).
- Burn the first 1000 shares to `address(0)` (the Uniswap pattern).

## Origin

The GoGoPool TokenggAVAX H-05 finding on Solodit. Same root cause as
the Cream Finance ~$130M loss in 2021.

## Exploit walkthrough

```
TX 1  approve(vault, max)
TX 2  vault.deposit(1)                    state: shares=1, assets=1
TX 3  asset.transfer(vault, 1001 ether)   state: shares=1, assets=1001e18+1
                                          → share price ≈ 1001 USDC each
TX 4  depositor.triggerVictimDeposit()    state: shares=1, assets=2001e18+1
                                          → victim share mint floors to 0
TX 5  vault.withdraw(1)                   → player receives 2001e18+1 wei

Final player balance ≈ 3000 USDC (started with 2000, donated 1001, got 2001 back).
Threshold is 2500 → solved.
```

## End-to-end deploy

```bash
cd examples/vault-inflation
forge install foundry-rs/forge-std
forge build
forge test -vvv             # both tests pass (exploit-succeeds + order-matters)

export DEPLOYER_KEY=0x...funded
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

Wire into the backend:

```bash
echo "FLAG_VAULTINF=CTF{1nfl4t3_th3_p13_4nd_3at_1t_t00}" \
  | sudo tee -a /opt/ctf/backend/.env

sudo -e /opt/ctf/backend/challenges.json    # paste challenges-entry.json, fill target

curl -sX POST https://ctf.example.com/api/admin/manifest/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Smoke test

```bash
PLAYER_KEY=0x...fresh burner with ~0.02 Sepolia ETH
PLAYER_KEY="$PLAYER_KEY" \
FACTORY="$DEPLOYED_FACTORY" \
BACKEND="https://ctf.example.com" \
CHALLENGE="vaultinf" \
node solver/solve.js
```

## What this example demonstrates

| Infra surface | Where you see it |
|---|---|
| Per-player factory pattern | `src/VaultFactory.sol` |
| Per-instance setup (mint balances, deploy helpers) | `src/Setup.sol` |
| Multi-contract deploy in one tx | `Setup` constructor |
| Solve check combining on-chain reads | `Setup.isSolved` (triggered AND balance ≥ threshold) |
| Forge regression test that proves both the exploit AND the negative case | `test/VaultInflation.t.sol` |
| Reference solver covering the whole flow | `solver/solve.js` |
