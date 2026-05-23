# Player onboarding

Two things every Sepolia-based event needs that this repo helps with:
preloaded gas in player wallets and a working RPC endpoint.

## Seeding wallets with gas

`scripts/seed-faucet.js` reads a list of addresses and drips testnet
ETH from an operator-controlled funding key. Idempotent — it skips
addresses already above a configurable threshold.

```bash
# wallets.csv (one address per row, or CSV with an address column)
team,address,email
alice,0xA7f8...c2932,alice@example.com
bob,0x3C44...4293BC,bob@example.com

FAUCET_KEY=0x...funded \
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
node scripts/seed-faucet.js wallets.csv --amount 0.02 --min 0.005

# Dry run shows the plan without sending:
node scripts/seed-faucet.js wallets.csv --dry-run
```

Flags:

| Flag | Default | Meaning |
|---|---|---|
| `--amount <eth>` | `0.02` | ETH to send to each address below the threshold. |
| `--min <eth>` | `0.005` | Skip if balance already at or above this. |
| `--rpc <url>` | `$RPC_URL` then Sepolia public | RPC endpoint. |
| `--dry-run` | off | Print the plan and exit. |

The script:

- Parses addresses out of CSVs (it finds the first `0x`-prefixed token
  on each line). Lines starting with `#` are treated as comments;
  duplicates are de-duped.
- Sends serially with explicit `nonce` so re-running after a partial
  failure works.
- Loads `ethers` from `backend/node_modules` so there's no separate
  install — run `cd backend && npm install` once.

## RPC for players

You almost certainly want players hitting a single, shared RPC
endpoint rather than the public PublicNode / Alchemy free tier
(those rate-limit aggressively). Options:

| Option | When |
|---|---|
| `https://ethereum-sepolia-rpc.publicnode.com` (default) | Small events, occasional play. |
| Alchemy / Infura free tier | A few hundred players, moderate volume. |
| Your own anvil-as-public-RPC behind nginx | Cost-free for any scale; you control the queues. |
| The backend's `/api/rpc/:instanceId?t=...` | Only for private-anvil challenges; not a general RPC. |

For shared-mode challenges, the per-deployment `CHAIN_ID` already
implies the RPC the backend itself uses. The frontend tells players
which RPC to point MetaMask at via the chain preset (see
[chains.md](chains.md)).

## What players should see on first connect

If you've configured a faucet list and `site.faucets` correctly:

1. Visit `https://ctf.example.com`, click **Connect wallet**, choose a
   burner.
2. The wallet pill shows their address; the status bar shows their
   balance. If it's below `lowBalanceThresholdEth`, a banner suggests
   public faucets.
3. They proceed to a challenge card. For private-anvil challenges they
   click **Spawn instance**, which surfaces an **Add network to wallet**
   button (auto-configures MetaMask to talk to their per-player RPC).

## Pre-event checklist

```text
□ /opt/ctf/backend/.env populated (RPC_URL, FLAG_*, SIGNER_KEY_*, ADMIN_TOKEN)
□ /opt/ctf/backend/challenges.json finalized with deployed addresses
□ ctf-admin reload reports the expected challenge count
□ ctf-admin challenges shows every entry with the right mode + signer
□ Operator wallet funded with ≥ 0.5 ETH (assuming 25 players × 0.02)
□ seed-faucet.js --dry-run output matches the expected wallet list
□ TLS works end-to-end (curl -I https://ctf.example.com/api/health)
□ /metrics scrape from your Prometheus shows ctf_drain_enabled 0
□ Webhook receiver is up and returns 200 on POST (ctf-admin smoke ...)
```
