# Private-anvil template

Per-player private chain. Each spawn boots a fresh container running
anvil with the challenge deployed; the player gets their own RPC URL and
contract address. No on-chain testnet gas, instant blocks, no state
shared between players.

Path: `contracts-template/private-anvil/`

## When to use this

- The bug needs **instant blocks** (front-running races, time-based
  exploits at second granularity).
- The bug is **destructive to shared state** (you'd otherwise need a
  per-player factory just to keep players from stepping on each other).
- The challenge needs **arbitrary tokens / balances / forks** that would
  cost real testnet ETH to set up.

For everything else, the shared-testnet templates ([single-instance](single-instance.md),
[per-player factory](per-player.md)) are cheaper to run.

## Layout

```
private-anvil/
├── Dockerfile
├── entrypoint.sh
├── foundry.toml
├── src/Challenge.sol
└── script/Deploy.s.sol
```

## Container contract

Three rules. The launcher enforces them.

1. **Listen on `0.0.0.0:8545`.** Anvil's default.
2. **Read `$PLAYER` from env.** The launcher injects the player's
   address; deploy your contract knowing who it's for.
3. **Print one line of `CTF_META={json}` to stdout** after deploy
   completes. The JSON must contain `target` (the address `isSolved`
   gets called on); optionally `extra` (freeform, surfaced to the UI).

That's the whole interface.

## Workflow

```bash
cd contracts-template/private-anvil
forge install foundry-rs/forge-std
forge build                                       # sanity-check
docker build -t ghcr.io/your-org/ctf-ch3:1.0 .
docker push ghcr.io/your-org/ctf-ch3:1.0
```

Register in `backend/challenges.json`:

```json
{
  "id": "ch3",
  "title": "Your title",
  "description": "...",
  "mode": "private-anvil",
  "image": "ghcr.io/your-org/ctf-ch3:1.0",
  "timeout": 1800
}
```

Set `FLAG_CH3=CTF{...}` in `.env`, restart, done.

## Customizing the bug

Edit `_check()` in `src/Challenge.sol` for the win condition. The
constructor receives the player address; store it, check it, use it.

Need multiple contracts? Build them in `Deploy.s.sol` and emit the
target along with helpers in `extra`:

```solidity
function run() external {
    address player = vm.envAddress("PLAYER");
    vm.startBroadcast(uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
    Token t = new Token();
    Vault v = new Vault(t, player);
    Challenge ch = new Challenge(v, player);
    t.mint(player, 1000 ether);
    vm.stopBroadcast();
    console2.log(string.concat(
        "CTF_META={\"target\":\"", vm.toString(address(ch)),
        "\",\"extra\":{\"vault\":\"", vm.toString(address(v)),
        "\",\"token\":\"", vm.toString(address(t)), "\"}}"
    ));
}
```

The `extra` fields flow through to `/api/instance/:id` so the frontend
can show them.

## What players see

A "Spawn instance" button on the challenge card. After clicking:

| Field | Source |
|---|---|
| RPC URL | `http://${PUBLIC_HOST}:${allocated_port}` |
| Target | from `CTF_META.target` |
| Expires at | `now + timeout` |
| Extra fields | from `CTF_META.extra` |

The player configures MetaMask with the RPC URL (chain id 31337,
unfunded — anvil's `--mnemonic test test test ...` gives them
pre-funded accounts), exploits, claims flag.

## Mainnet-fork mode

Set `fork.url` (and optionally `fork.blockNumber`) on the challenge entry
to make anvil boot as a fork of a real chain. Your deploy script can
then interact with already-deployed real-world contracts.

```json
{
  "id": "ch5",
  "mode": "private-anvil",
  "image": "ghcr.io/your-org/ctf-ch5:1.0",
  "timeout": 1800,
  "fork": {
    "url": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "blockNumber": 19000000
  }
}
```

The launcher injects `FORK_URL` and `FORK_BLOCK_NUMBER` into the
container's env; the bundled `entrypoint.sh` passes them through to
anvil. Audit-style challenges ("here's a $5M exploit, replay it") are
trivial in this mode — just deploy a wrapper that calls the real
contracts.

## Operations

Spawning containers means the backend needs Docker socket access. See
[Launcher](../operations/launcher.md) for the security implications and
the env vars that control the port pool, lifetime, and network.

## Gas, blocks, time

Anvil is configured with `--block-time 1` by default — one block per
second. If your challenge depends on a longer interval (e.g. cliff
vesting), either bump the block time in `entrypoint.sh` or have your
exploit advance time via `evm_increaseTime`.

Anvil exposes the full `anvil_*` and `evm_*` RPC method families. The
direct port binding gives the player unfettered access — they can
`anvil_setBalance` themselves to infinite ETH. That's fine for a
*private* chain: only that one player is on it.
