# Getting started

Two paths:

1. **Try it locally in 60 seconds** — anvil + three example contracts +
   the live backend on your laptop. Best way to see what the project
   actually does.
2. **Stand it up on a VPS for a real event** — ~15 minutes on a fresh
   Debian/Ubuntu host with a domain + Cloudflare.

## Local demo (recommended first)

```bash
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
cd ctf-blockchain-infra
./scripts/demo.sh
```

The script:

1. Installs foundry via `foundryup` if `forge`/`cast`/`anvil` aren't
   already on your PATH (asks first; pass `YES=1` to skip the prompt).
2. Installs backend npm deps if needed.
3. `git init`s the repo if it isn't one yet (`forge install` needs it).
4. Boots anvil on `127.0.0.1:8545` with the test mnemonic.
5. Deploys [`signature-replay`](challenges/single-instance.md),
   [`vault-inflation`](challenges/per-player.md), and
   [`koth-frozen-king`](challenges/koth.md) against it.
6. Writes a manifest + env to `/tmp/ctf-demo/`.
7. Starts the backend on `127.0.0.1:8787` with the frontend mounted at `/`.

Open <http://127.0.0.1:8787>. MetaMask will prompt to add the local
network on first connect — approve, then import the printed player
key.

```bash
./scripts/demo.sh stop      # tear it down
./scripts/demo.sh status    # what's running
just demo                   # same as `./scripts/demo.sh` (also: just demo-stop)
```

For the **VPS deploy** below, replace step 1 with `ssh` + clone on the
target host.

## Prerequisites for a real deploy

- A VPS (Debian 12 or Ubuntu 22.04+ recommended).
- A domain you control, with a proxied Cloudflare A record pointing at the VPS.
- A funded deployer wallet on whichever testnet you target (Sepolia by default).
- Foundry installed locally: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

## 1. Clone the repo

```bash
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
cd ctf-blockchain-infra
```

## 2. Author a challenge

Start from one of the templates:

=== "Single instance"

    ```bash
    cd contracts-template/single-instance
    forge install foundry-rs/forge-std
    ```

    Edit `src/Challenge.sol` — replace `_check()` with your win condition.

=== "Per-player factory"

    ```bash
    cd contracts-template/per-player
    forge install foundry-rs/forge-std
    ```

    Edit `src/Factory.sol` — give `Instance` your storage and bug, and replace `_check()` with your win condition.

Build and deploy:

```bash
export DEPLOYER_KEY=0x...your funded testnet key
export SIGNER_ADDRESS=0x...the wallet your backend will use to sign  # single-instance only
export RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

forge build
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv
```

Copy the printed `target` address — you'll paste it into `backend/challenges.json` in step 4.

## 3. Provision the server

=== "Docker Compose (recommended)"

    ```bash
    ssh root@your-vps
    apt-get install -y docker.io docker-compose-plugin
    git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
    cd ctf-blockchain-infra
    cp backend/.env.example backend/.env
    cp backend/challenges.example.json backend/challenges.json
    # edit both, then:
    docker compose up -d --build
    ```

    Frontend on `:8080`. See [Docker](operations/docker.md) for details.

=== "Kubernetes"

    ```bash
    kubectl create namespace ctf
    kubectl apply -k deploy/kubernetes/
    ```

    Requires you to push the backend + frontend images first and point the Kustomize overlay at them. See [Kubernetes](operations/kubernetes.md).

=== "Bare-metal"

    ```bash
    ssh root@your-vps
    git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
    cd ctf-blockchain-infra
    sudo bash deploy/install.sh
    ```

    Installs Node 20, nginx, UFW, the systemd unit, and a Cloudflare-only firewall on port 8080.

## 4. Configure the backend

```bash
sudo vim /opt/ctf/backend/.env
```

Set:

- `RPC_URL`, `CHAIN_ID`
- One `FLAG_<ID>` per challenge (`FLAG_CH01=CTF{...}`)
- One `SIGNER_KEY_<ID>` per challenge that uses a backend signer

```bash
sudo vim /opt/ctf/backend/challenges.json
```

Paste your contract address into the matching challenge's `target` field. Update `info`, `description`, `downloads`.

## 5. Start it

```bash
sudo systemctl start ctf-backend
sudo systemctl status ctf-backend
curl -sf http://127.0.0.1:8787/api/health | jq
```

## 6. Wire Cloudflare

- DNS: proxied A record pointing at your VPS.
- SSL/TLS mode: **Flexible** (cheapest path) or **Full** if you terminated TLS at nginx.
- Origin Rules: rewrite destination port to **8080** for your hostname.
- Always Use HTTPS: on.

See [Cloudflare hardening](operations/cloudflare.md) for details.

## 7. Smoke test

```bash
curl -s https://ctf.example.com/api/health
curl -s 'https://ctf.example.com/api/status/ch01?address=0xYourPlayerAddress'
```

Open the URL in a browser. Connect a burner wallet. Claim a flag once the bug is exploited.

Done.

!!! tip "Update the Cloudflare CIDR allowlist periodically"
    Cloudflare's IP ranges do change. Re-run `deploy/cloudflare/ufw-allow-cloudflare.sh` from a weekly cron so your firewall stays correct.
