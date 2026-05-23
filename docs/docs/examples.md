# Worked examples

The repo ships fully-runnable example challenges in `examples/`. Each
one demonstrates the whole pipeline end-to-end so adopters have a
concrete reference rather than just templates.

| Example | Pattern | Source bug |
|---|---|---|
| [`signature-replay/`](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/examples/signature-replay) | Single-instance + backend signer | Missing nonce/deadline in an off-chain authorized withdraw (Taiko TimelockTokenPool H-05). |
| [`vault-inflation/`](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/examples/vault-inflation) | Per-player factory | ERC4626 first-depositor inflation (GoGoPool TokenggAVAX H-05 / Cream Finance 2021). |
| [`koth-frozen-king/`](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/examples/koth-frozen-king) | KOTH (shared) | Highest-balance KOTH with `withdraw()` that doesn't reset `kingScore`. Asymmetric-state-update pattern. |
| [`eip712-replay/`](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/examples/eip712-replay) | Single-instance + EIP-712 signer | EIP-712 `Permit` missing a nonce — replay-able even though everything else (chain id, deadline, msg.sender) is correctly bound. |
| [`oracle-manipulation/`](https://github.com/0xNoramiya/ctf-blockchain-infra/tree/main/examples/oracle-manipulation) | Private-anvil | Spot-price AMM oracle + uncapped borrow against collateral. First example to exercise the per-player Docker image path. |

## Anatomy of an example

```
examples/signature-replay/
├── foundry.toml                 # remaps @infra/ to contracts-template/lib/
├── src/
│   └── VaultPool.sol            # the contract, with the deliberate bug
├── test/
│   └── VaultPool.t.sol          # forge tests that prove the bug is reachable
├── script/
│   └── Deploy.s.sol             # deploy + print copy-paste manifest values
├── solver/
│   └── solve.js                 # reference exploit: fetch sig → replay → claim
├── challenges-entry.json        # paste this into backend/challenges.json
└── README.md
```

## What goes where, per piece of the infra

| Infra surface | Source of truth in the example |
|---|---|
| Backend signer template (`personal-sign` or `eip712`) | `challenges-entry.json` `signer` block |
| On-chain win condition (`isSolved`) | `src/*.sol` |
| Backend flag string | `FLAG_<ID>` in `/opt/ctf/backend/.env` |
| Frontend card metadata (info, downloads) | `challenges-entry.json` |
| Forge CI coverage | `test/*.t.sol` (picked up by the `Contracts` workflow if you mirror the layout under `contracts-template/`) |
| Player documentation | `README.md` |
| Smoke test | `solver/solve.js` (run from any machine with `PLAYER_KEY` set) |

## How to use these

1. **Pick** the example closest to your intended bug pattern.
2. **Copy** it into a new directory.
3. **Modify** the Solidity to swap the bug for yours. Keep the
   `isSolved(address)` shape; everything else is yours.
4. **Re-test** with `forge test -vvv`. If you adapt the bug, adapt the
   `test_*_succeeds_to_solve` assertion.
5. **Deploy** with the included script. Capture the printed target.
6. **Wire** the manifest snippet into `backend/challenges.json`, set
   `FLAG_<ID>` and `SIGNER_KEY_<ID>` envs.
7. **Reload** via `POST /api/admin/manifest/reload`.
8. **Smoke-test** with the included `solver/`.

## Adding a new example

PRs welcome. The bar for inclusion:

- A real bug pattern with a Solodit / public-audit citation.
- Forge tests that fail if the bug is patched (regression-proof).
- A solver script that completes in under one minute on Sepolia.
- A README under 200 lines.

Good candidates we don't have yet:

- Reentrancy in a yield aggregator — pairs with `private-anvil/`.
- Oracle manipulation via spot-price LP — pairs with `private-anvil/`
  in mainnet-fork mode.
- Cross-chain replay (chainId missing from a signed digest) — pairs
  with `single-instance/` + `personal-sign`.
- Storage collision via uninitialized proxy — pairs with `per-player/`.
- Compromised governance via `delegatecall` to attacker-supplied
  address — pairs with `private-anvil/`.
