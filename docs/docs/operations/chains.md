# Chain presets

The backend ships a curated `chains.json` next to `server.js` mapping
chain IDs to user-facing metadata: name, native symbol, block explorer,
default faucet URLs. When the backend boots, it looks up `CHAIN_ID`,
merges the preset into `site`, and exposes the result at `/api/config`.

The frontend uses the merged data to:

- Pretty-print the chain name in the wallet pill (instead of "chain 11155111").
- Show explorer links (`↗`) next to every address-kind info field.
- Surface the right faucet links when a player's balance is low.

## Supported chain IDs

| ID | Name | Symbol |
|---|---|---|
| 1 | Ethereum | ETH |
| 10 | Optimism | ETH |
| 137 | Polygon | POL |
| 8453 | Base | ETH |
| 11155111 | Sepolia | ETH |
| 17000 | Holesky | ETH |
| 84532 | Base Sepolia | ETH |
| 11155420 | Optimism Sepolia | ETH |
| 421614 | Arbitrum Sepolia | ETH |
| 42161 | Arbitrum One | ETH |
| 80002 | Polygon Amoy | POL |
| 31337 | Anvil (local) | ETH |

Adding more is one PR — edit `backend/chains.json`. The schema is
self-evident; no code change required.

## Overrides

`site` in `challenges.json` wins over the preset. Set a key explicitly
to override that single field:

```json
"site": {
  "title": "My CTF",
  "blockExplorer": "https://my-private-explorer.example.com",
  "faucets": [
    { "label": "internal faucet", "url": "https://faucet.internal" }
  ]
}
```

Unset keys fall through to the preset. The merge is shallow — to keep
the preset's faucets while overriding the explorer, just omit
`faucets` from your `site`.

## ERC-20 helpers

A new `kind: "erc20"` on an info entry tells the frontend to render two
extras next to the address:

- An explorer link (same as `kind: "address"`).
- A `+ wallet` button that triggers `wallet_watchAsset`, adding the
  token to the player's wallet so they can see their balance change as
  they exploit.

```json
{
  "label": "Token",
  "value": "0xDeployedToken",
  "kind": "erc20",
  "symbol": "VLT",
  "decimals": 18,
  "image": "https://example.com/vlt-logo.png"
}
```

The `image` URL is optional and only used by wallets that respect it
(MetaMask Desktop does; mobile is hit-or-miss).

## Private-anvil note

The launcher gives each player chain id 31337 (anvil's default).
That preset's faucets array is empty by design — players don't need
faucet ETH on their private chain; anvil's `--mnemonic test test test
…` accounts ship pre-funded.

If your private-anvil setup uses a non-31337 chain id (`anvil
--chain-id ...`), the preset lookup will fall through to whatever you've
added in `chains.json` (or to nothing, with no warning — the frontend
gracefully degrades).
