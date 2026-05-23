---
hide:
  - navigation
  - toc
---

# ctf-blockchain-infra

Open-source infrastructure for running on-chain CTF challenges on a public testnet.

Drop in your Solidity. Deploy. Players connect a wallet, exploit your bug, and claim the flag — gated end-to-end by an on-chain `isSolved(player)` check.

<div class="grid cards" markdown>

-   :material-rocket-launch: **Quick start**

    ---

    Stand up the whole stack on a $5 VPS in ~15 minutes.

    [:octicons-arrow-right-24: Getting started](getting-started.md)

-   :material-puzzle: **Challenge templates**

    ---

    Two starting points: a shared instance with a backend signer, and a per-player factory.

    [:octicons-arrow-right-24: Templates](challenges/overview.md)

-   :material-cloud-lock: **Production-ready ops**

    ---

    Systemd, nginx, Cloudflare origin hardening, UFW allowlist. All scripted.

    [:octicons-arrow-right-24: Deployment](deployment.md)

-   :material-flask: **Architecture**

    ---

    Static frontend, a tiny Node backend, and Solidity contracts. Nothing more.

    [:octicons-arrow-right-24: Architecture](architecture.md)

</div>

## What you get

- **Backend (Node + ethers)** — reads a `challenges.json` manifest, verifies `isSolved(player)` against your deployed contract, releases flags from a root-owned `.env`. Optional per-challenge signer endpoint for signature-replay style bugs.
- **Frontend (vanilla, no build step)** — light theme, data-driven from `/api/config`. Wallet connect, optional signature request, claim flag. Add your branding by editing one CSS file.
- **Contract templates (Foundry)** — `single-instance/` and `per-player/`. Both expose `isSolved(address) view returns (bool)`.
- **Deploy scripts** — systemd unit with hardening, nginx vhost, UFW Cloudflare-allowlist updater, one-shot `install.sh` for a fresh Debian/Ubuntu box.

## Design constraints

- **Flags live only in `/opt/ctf/backend/.env`** (chmod 600, root-owned). The frontend, the public API, and the on-chain bytecode never see them.
- **No private keys in the repo.** Signer key and deployer key live in env vars.
- **One ABI to rule them all:** the backend only ever calls `isSolved(address) view returns (bool)`. Your challenge can have any internal shape it wants behind that.

## Not in scope

This is infrastructure, not challenges. The included templates intentionally never return `true` from `isSolved()` — they are skeletons you build on. See [Adding a challenge](challenges/overview.md).
