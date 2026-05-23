# Shared lib

Tiny Solidity helpers each template uses. Symlink or copy into your
challenge project; no separate Foundry install needed (they're plain
files).

| File | What |
|---|---|
| `IChallenge.sol`    | The single-function interface the backend speaks. |
| `CtfChallenge.sol`  | Optional abstract base codifying `player + isSolved + Solved event + recordSolve`. |
| `MockERC20.sol`     | Minimal ERC20 for fixtures. Not production-grade. |
| `CtfMeta.sol`       | Helper that emits the `CTF_META={...}` line the private-anvil launcher reads from container stdout. |

The templates inline these via relative imports (`../../lib/...`), so
they Just Work after `forge install foundry-rs/forge-std`.
