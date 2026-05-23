# ctf-blockchain-infra

Open-source infrastructure for hosting on-chain CTF challenges. Drop in
your Solidity, deploy to a public testnet (or per-player anvils), gate
flags by on-chain `isSolved(player)`.

Inspired by [paradigm-ctf-infrastructure](https://github.com/paradigmxyz/paradigm-ctf-infrastructure)
and [TCP1P-CTF-Blockchain-Infra](https://github.com/TCP1P/TCP1P-CTF-Blockchain-Infra),
but small, single-file modules, and reproducible from a fresh clone in
one command.

## Try it locally — 60 seconds

```bash
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
cd ctf-blockchain-infra
./scripts/demo.sh
```

That installs foundry if missing, boots a local anvil, deploys the
three on-chain examples, writes a manifest + env, and starts the
backend with the frontend mounted. Open <http://127.0.0.1:8787> and
connect MetaMask (it will offer to add the network on first connect).

```bash
./scripts/demo.sh stop      # tear it all down
./scripts/demo.sh status    # what's running
```

If you don't have `forge` / `cast` / `anvil` on PATH, the script asks
once whether to install foundry via the official `foundryup` script.
Pass `YES=1` to skip the prompt.

## What you get

- **Backend** — Node + ethers, three deps. Reads a `challenges.json`
  manifest, gates flags by `isSolved(player)`, emits structured JSON
  logs, exposes Prometheus metrics + an OpenAPI spec, optional
  scoreboard webhook on solve transitions.
- **Frontend** — Vanilla HTML/CSS/JS, no build step, single CSS file
  to rebrand. Light theme. Renders entirely from `/api/config`.
- **Contracts** — Four Foundry templates (single-instance, per-player
  factory, private-anvil container, KOTH) + five runnable example
  challenges modeled on real audit findings.
- **Per-player private chains** — opt-in Docker-launched anvil per
  player. Method-allowlisted JSON-RPC proxy, per-instance access
  tokens, `evm_snapshot`-backed sub-second state reset, mainnet-fork
  support.
- **Admin surface** — bearer-token-gated `/api/admin/*` with manifest
  hot-reload, instance draining, drain-mode for maintenance windows,
  writeup retrieval. Reachable via the bundled `bin/ctf-admin` CLI.
- **EIP-712 + personal-sign signer** — backend issues per-challenge
  authorization signatures from a manifest-declared template.
- **Deploy paths** — Docker Compose (recommended), Helm chart with
  OCI publishing, Kubernetes Kustomize base with NetworkPolicies,
  bare-metal `install.sh` for Debian/Ubuntu.

## Repo layout

```
ctf-blockchain-infra/
├── scripts/
│   ├── demo.sh                 ← one-command local demo
│   ├── e2e-smoke.sh            CI end-to-end harness
│   ├── build-dist.py           per-example player-distributable zips
│   └── seed-faucet.js          drip Sepolia ETH to a player list
├── backend/                    Node server: manifest, flag gating, launcher, admin
├── frontend/                   Static UI; data-driven from /api/config
├── contracts-template/         Skeletons you fork to add a bug
│   ├── single-instance/        + optional backend signer
│   ├── per-player/             factory + per-player Instance
│   ├── private-anvil/          per-player Docker container
│   └── koth/                   king of the hill
├── examples/                   Fully-runnable reference challenges
│   ├── signature-replay/       Taiko TimelockTokenPool H-05 variant
│   ├── vault-inflation/        GoGoPool TokenggAVAX H-05 / Cream 2021
│   ├── koth-frozen-king/       asymmetric-state-update pattern
│   ├── eip712-replay/          ERC-2612-shaped permit, no nonce
│   └── oracle-manipulation/    spot-price AMM + uncapped LTV
├── packs/                      portable bundles for shipping one challenge
├── deploy/
│   ├── install.sh              bare-metal Debian/Ubuntu installer
│   ├── systemd/                ctf-backend.service
│   ├── nginx/                  site.conf (bare-metal vhost)
│   ├── docker/                 (compose pieces — see ../docker-compose.yml)
│   ├── kubernetes/             Kustomize base with NetworkPolicy
│   ├── helm/                   values-driven chart (publishes to GHCR OCI)
│   └── cloudflare/             UFW allowlist + Cloudflare CIDR refresher
├── bin/ctf-admin               organizer CLI for /api/admin/*
├── docs/                       MkDocs Material (deploys to GitHub Pages)
└── docker-compose.yml          one-command production-style deploy
```

## Production deploy

For a real event, you don't want the demo path — you want one of:

```bash
docker compose up -d --build           # single-host
helm install ctf oci://ghcr.io/<owner>/charts/ctf-blockchain-infra
sudo bash deploy/install.sh             # bare-metal Debian/Ubuntu
```

See [`docs/docs/deployment.md`](docs/docs/deployment.md) for the
walkthrough, [`docs/docs/operations/cloudflare.md`](docs/docs/operations/cloudflare.md)
for origin hardening, [`docs/docs/operations/onboarding.md`](docs/docs/operations/onboarding.md)
for player-wallet seeding.

## Documentation

Full docs site auto-deploys from `docs/` to GitHub Pages.

- [Getting started](docs/docs/getting-started.md)
- [Architecture](docs/docs/architecture.md) — shared vs. per-player-anvil modes
- [Challenge templates](docs/docs/challenges/overview.md)
- [Worked examples](docs/docs/examples.md)
- [Challenge packs](docs/docs/packs.md) — ship a challenge as a portable bundle
- [Operations](docs/docs/operations/launcher.md) — launcher, admin, metrics, webhooks
- [API reference](docs/docs/api.md) — OpenAPI 3.1
- [FAQ](docs/docs/faq.md)

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Worked examples
must cite a real audit finding (Solodit / c4 / immunefi); templates
stay skeletal.

The repo ships a `.devcontainer/` config (foundry + node + just
pre-installed). `just` wraps every common task; run `just` for the menu.

## License

MIT. See [LICENSE](LICENSE).
