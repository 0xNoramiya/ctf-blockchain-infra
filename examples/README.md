# examples

Runnable, end-to-end reference challenges. Templates in
`contracts-template/` are skeletons; these are fully wired
implementations you can deploy as-is to verify your infra, then
fork-and-customize.

| Example | Pattern | Source bug |
|---|---|---|
| [signature-replay](signature-replay/) | Single-instance + backend signer | Missing nonce/deadline in an off-chain authorized withdraw — Taiko TimelockTokenPool H-05 variant. |
| [vault-inflation](vault-inflation/) | Per-player factory | ERC4626 first-depositor inflation — GoGoPool TokenggAVAX H-05 / Cream Finance 2021 pattern. |
| [koth-frozen-king](koth-frozen-king/) | KOTH (shared) | Highest-balance KOTH with a `withdraw()` that decrements score but never resets `kingScore` — c4-style "asymmetric state update" bug. |
| [eip712-replay](eip712-replay/) | Single-instance + EIP-712 signer | EIP-712 Permit with no `nonce` in the typed struct — exercises the `signer.type: "eip712"` path, demonstrates EIP-712 ≠ auto-replay-safe. |
| [oracle-manipulation](oracle-manipulation/) | Private-anvil | Spot-price AMM oracle + uncollateralized borrow caps. Exercises the per-player Docker image build + `CTF_META` extras path. |

Each example contains:

- `src/` — full Solidity, including any helper contracts.
- `script/Deploy.s.sol` — opinionated deploy that prints copy-paste
  values for the backend manifest.
- `test/` — forge tests that lock in the bug (both `does-not-revert` and
  `replay-succeeds-to-solve` assertions).
- `solver/` — a reference exploit script the organizer can run to
  smoke-test the deployed challenge after wiring.
- `challenges-entry.json` — the snippet to paste into
  `backend/challenges.json`.
- `README.md` — wiring walkthrough.

## Suggested usage

1. Pick the example closest to the bug pattern you want.
2. Copy it into `examples/your-challenge/` (or anywhere outside the repo).
3. Rename contracts, change the bug, rerun `forge test`.
4. Deploy. Wire. Test. Ship.

The remappings in each `foundry.toml` (`@infra/=../../contracts-template/lib/`)
let you import the shared lib without copying. If you move the directory,
update or drop the remapping.
