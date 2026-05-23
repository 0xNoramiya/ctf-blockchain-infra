# Single-instance template

One contract for all players. Cheapest to deploy, easiest to reason about.

Path: `contracts-template/single-instance/`

## Layout

```
single-instance/
├── foundry.toml
├── src/
│   └── Challenge.sol     # constructor takes a signer address; isSolved + _check
└── script/
    └── Deploy.s.sol      # reads DEPLOYER_KEY and SIGNER_ADDRESS from env
```

## Anatomy of the template

```solidity
contract Challenge is IChallenge {
    address public immutable signer;

    constructor(address _signer) { signer = _signer; }

    function isSolved(address player) external view virtual returns (bool) {
        return _check(player);
    }

    function _check(address /*player*/) internal view virtual returns (bool) {
        return false;  // unmodified template never solves
    }
}
```

Replace `_check()` with your win condition. Add storage, events, broken functions.

## Pattern: backend-issued signature with replay bug

Set `signer.enabled: true` in the challenge entry. The backend signs `keccak256(template_values)` as a `personal_sign` message; your contract verifies it.

The template you ship to players is configured in `challenges.json`:

```json
"signer": {
  "enabled": true,
  "label": "GET RECEIPT",
  "template": [
    { "type": "string",  "value": "Withdraw" },
    { "type": "address", "value": "$player" },
    { "type": "uint256", "value": "100000000000000000000" }
  ]
}
```

`$player` is replaced server-side with the requester's address (the only allowed substitution variable).

Your contract's verifier should match:

```solidity
function withdraw(address to, uint256 amount, bytes calldata sig) external {
    bytes32 inner = keccak256(abi.encodePacked("Withdraw", to, amount));
    bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    address recovered = ECDSA.recover(digest, sig);
    require(recovered == signer, "bad sig");
    require(msg.sender == to, "only recipient");
    token.transfer(to, amount);
}
```

The deliberate bug: no nonce, no deadline, no `consumed[sig]` flag. The same signature works forever. Players figure that out and replay it until they hit the win threshold.

!!! warning "Signer key handling"
    `SIGNER_KEY_<ID>` lives only in `/opt/ctf/backend/.env`. The frontend never sees it. Anyone who exfiltrates the key can mint signatures for any address — they still can't claim a *flag* unless the bug exists on-chain, but they could grief by draining the pool. Treat it like any production secret.

## Deploy script

```bash
export DEPLOYER_KEY=0x...funded testnet wallet
export SIGNER_ADDRESS=0x...address derived from SIGNER_KEY_<ID>
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

The script prints the target address. Paste it into `challenges.json`.

## Distributing source

Players will reverse-engineer the bytecode if you don't ship source. Strip comments that spoil the bug, then zip the `.sol` files:

```bash
zip /opt/ctf/frontend/dist/ch01.zip src/*.sol
```

`challenges.json` already references `/dist/ch01.zip` in `downloads[]`, so the card gets a download chip automatically.
