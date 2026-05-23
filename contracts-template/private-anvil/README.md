# private-anvil template

Per-player private chain. Each `spawn` boots a fresh container running
anvil with the challenge pre-deployed; the player gets their own RPC URL
and contract address. No on-chain testnet gas, no state shared between
players, no cleanup nightmares.

## Layout

```
private-anvil/
├── Dockerfile
├── entrypoint.sh
├── foundry.toml
├── src/Challenge.sol
└── script/Deploy.s.sol
```

## Workflow

```bash
cd contracts-template/private-anvil
forge install foundry-rs/forge-std
forge build                                 # sanity-check the Solidity
docker build -t ghcr.io/your-org/ctf-ch3:1.0 .
docker push ghcr.io/your-org/ctf-ch3:1.0
```

Register it in `backend/challenges.json`:

```json
{
  "id": "ch3",
  "title": "Your title",
  "description": "Player brief.",
  "mode": "private-anvil",
  "image": "ghcr.io/your-org/ctf-ch3:1.0",
  "timeout": 1800,
  "info": [
    { "label": "Mode", "value": "private anvil per player" },
    { "label": "Lifetime", "value": "30 minutes" }
  ]
}
```

Set `FLAG_CH3=CTF{...}` in `.env`. Restart the backend. Players see a
"Spawn instance" button on the card.

## How the launcher and the container agree

The launcher imposes one rule on the image: **print exactly one line of
the form `CTF_META={json}` to stdout, containing a `target` address**.

```
CTF_META={"target":"0x5FbDB2315678afecb367f032d93F642f64180aa3","extra":{"player":"0x..."}}
```

The launcher waits up to ~15 seconds after start for that line to appear
(while polling anvil for readiness). After that, the player is given:

| Field | Where it goes |
|---|---|
| `rpcUrl` | shown in the UI; players configure MetaMask to talk to it |
| `target` | the contract `isSolved(address)` will be called on |
| `extra` | passed through to the frontend, freeform JSON |

## Customizing the bug

Replace the body of `_check()` in `src/Challenge.sol`. The constructor
gets the player address — store it, use it in your check.

Need more contracts? Deploy them in `Deploy.s.sol` and reference the
target you actually want `isSolved` called on:

```solidity
function run() external {
    address player = vm.envAddress("PLAYER");
    vm.startBroadcast(uint256(0xac0974...));
    Token t = new Token();
    Vault v = new Vault(t, player);
    Challenge ch = new Challenge(player, v);
    t.transfer(address(v), 1_000_000 ether);
    vm.stopBroadcast();
    console2.log(string.concat(
        "CTF_META={\"target\":\"", vm.toString(address(ch)),
        "\",\"extra\":{\"vault\":\"", vm.toString(address(v)),
        "\",\"token\":\"", vm.toString(address(t)), "\"}}"
    ));
}
```

## Throughput considerations

Each player container is ~50 MB RAM idle and one anvil process per spawn.
Set `timeout` per challenge to your shortest sensible value — the
launcher reaps expired instances every 15 seconds.

For events with hundreds of concurrent players, also tune:

- `INSTANCE_PORT_START` / `INSTANCE_PORT_END` env on the backend (port
  pool size; default 30000–30999).
- Host kernel `net.ipv4.ip_local_port_range` and file descriptor limits.
