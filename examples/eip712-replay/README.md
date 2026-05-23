# examples/eip712-replay

Fourth worked example. Exercises the backend's `signer.type: "eip712"`
path: the manifest declares a full EIP-712 typed-data spec, the
backend signs an instance of that struct for the requesting player,
the contract verifies via the standard `\x19\x01 || DOMAIN || hash`
recipe. The bug is the same one in [signature-replay](../signature-replay)
but expressed in EIP-712 typed data — the Permit struct has no
nonce, so one signature works forever.

## The teaching point

EIP-712 is often presented as "the safe way to sign". That's a
half-truth: EIP-712 prevents *digest collisions across protocols*
(via the typed domain separator) and gives wallets a readable UI. It
does **not** protect against replay on its own — that's what the
`nonce` field in the standard `ERC20Permit` shape is for.

```solidity
bytes32 public constant PERMIT_TYPEHASH = keccak256(
    "Permit(address spender,uint256 amount,uint256 deadline)"
);                          // 🚨 no nonce

function permit(uint256 amount, uint256 deadline, bytes calldata sig) external {
    bytes32 structHash = keccak256(abi.encode(
        PERMIT_TYPEHASH, msg.sender, amount, deadline
    ));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    require(_recover(digest, sig) == signer, "bad sig");
    require(token.transfer(msg.sender, amount), "tf");
}
```

Mitigation (canonical):

```solidity
mapping(address => uint256) public nonces;
bytes32 public constant PERMIT_TYPEHASH = keccak256(
    "Permit(address spender,uint256 amount,uint256 deadline,uint256 nonce)"
);

function permit(uint256 amount, uint256 deadline, bytes calldata sig) external {
    bytes32 structHash = keccak256(abi.encode(
        PERMIT_TYPEHASH, msg.sender, amount, deadline, nonces[msg.sender]++
    ));
    // ... rest unchanged ...
}
```

## End-to-end deploy

```bash
cd examples/eip712-replay
forge install foundry-rs/forge-std
forge build
forge test -vvv             # four tests including the replay assertion

export DEPLOYER_KEY=0x...funded
SIGNER_KEY=$(cast wallet new --json | jq -r '.[0].private_key')
export SIGNER_ADDRESS=$(cast wallet address --private-key "$SIGNER_KEY")

forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

Wire into the backend (note the `chainId: "$chainId"` placeholder —
the backend substitutes the configured chain id automatically):

```bash
cat >> /opt/ctf/backend/.env <<EOF
FLAG_EIP712REPLAY=CTF{p3rmit_but_n3v3r_n0nc3d}
SIGNER_KEY_EIP712REPLAY=$SIGNER_KEY
EOF

sudo -e /opt/ctf/backend/challenges.json   # paste + replace verifyingContract / vault addresses

ctf-admin reload
```

## Smoke test

```bash
PLAYER_KEY=0x... \
VAULT=0x... \
BACKEND=https://ctf.example.com \
CHALLENGE=eip712replay \
node solver/solve.js
```

## What this example demonstrates

| Surface | Where |
|---|---|
| Backend EIP-712 signer (`signer.type: "eip712"`) | `challenges-entry.json` `signer.typedData` |
| `$player` / `$chainId` substitution at sign time | same; resolved by the backend |
| On-chain typed-data verification | `PermitVault.permit` |
| Forge fuzz-safe test that proves the bug | `test/PermitVault.t.sol::test_ReplayDrainsToSolve` |
| Reference exploit that consumes the eip712 endpoint | `solver/solve.js` |
| ERC20-Permit-shaped mitigation reasoning | this README |
