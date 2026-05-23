# Deployment

Pick a path. All three end up with the same surface: a frontend on a public port, a backend on `127.0.0.1`, secrets in a root-owned file.

| Path | When to use |
|---|---|
| **[Docker Compose](operations/docker.md)** *(recommended)* | One box, one command. The default. |
| **[Kubernetes](operations/kubernetes.md)** | You already have a cluster. Want autoscaling, multi-replica, integrated secrets. |
| **Bare-metal (`install.sh`)** | No container runtime on the box. Documented below for completeness. |

For the speedrun version of any path, see [Getting started](getting-started.md).

## Bare-metal walkthrough

## Target environment

| | Recommended |
|---|---|
| OS | Debian 12 or Ubuntu 22.04+ |
| Node | 20.x (installed by `deploy/install.sh`) |
| Reverse proxy | nginx |
| Firewall | UFW, Cloudflare CIDRs only |
| TLS | Cloudflare Flexible (or Full if you terminate at nginx) |
| Process supervisor | systemd |

A $5/mo VPS is enough for a CTF with hundreds of players. The bottleneck is your RPC provider, not your box.

## Layout on disk

```
/opt/ctf/
├── backend/
│   ├── server.js              # deployed from repo
│   ├── package.json
│   ├── node_modules/
│   ├── challenges.json        # YOU edit this on the server
│   └── .env                   # root:root, chmod 600 — flags + signer keys
└── frontend/
    ├── index.html
    ├── style.css
    ├── app.js
    └── dist/                  # contracts.zip for player download
        └── ch01.zip
```

## Step-by-step

### 1. Bootstrap with `install.sh`

```bash
ssh root@your-vps
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
cd ctf-blockchain-infra
sudo bash deploy/install.sh
```

What it does:

- `apt install` Node 20, nginx, UFW, jq.
- Creates a `ctf` system user.
- Rsyncs `backend/` and `frontend/` into `/opt/ctf/`.
- `npm install --omit=dev` in the backend.
- Installs `ctf-backend.service`.
- Installs nginx vhost on port 8080.
- Runs `ufw-allow-cloudflare.sh` to scope the public port to Cloudflare only.

### 2. Edit the manifest

```bash
sudo -e /opt/ctf/backend/challenges.json
```

For each challenge:

- Set `target` to the deployed contract address.
- Update `info[]` — addresses, win condition. Players see this verbatim.
- Update `downloads[]` if you ship contracts as a zip.
- Write a `description` that hints at the bug without spoiling it.

### 3. Edit the secrets

```bash
sudo -e /opt/ctf/backend/.env
```

```ini
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CHAIN_ID=11155111

FLAG_CH01=CTF{actual_flag_value_goes_here}
SIGNER_KEY_CH01=0xabc...  # only if ch01.signer.enabled
```

The file is already `chmod 600 root:root`. The systemd unit reads it via `EnvironmentFile=` before dropping to the `ctf` user.

### 4. Distribute contract zips

Players want to read the Solidity. Strip comments that spoil the bug, then zip just the `.sol` files:

```bash
cd path/to/your/challenge
zip /opt/ctf/frontend/dist/ch01.zip src/*.sol
```

Make sure the path matches `challenges.json[].downloads[].url`.

### 5. Start the service

```bash
sudo systemctl start ctf-backend
sudo systemctl status ctf-backend
sudo journalctl -u ctf-backend -f
```

You should see one log line per loaded challenge.

### 6. Wire DNS + Cloudflare

See [Cloudflare hardening](operations/cloudflare.md).

### 7. End-to-end test

From a separate machine, run the exploit, then:

```bash
curl -s 'https://ctf.example.com/api/status/ch01?address=0xPlayer'
# → {"solved":true}
curl -s 'https://ctf.example.com/api/flag/ch01?address=0xPlayer'
# → {"solved":true,"flag":"CTF{...}"}
```

If `status` returns `false` but you believe the player has won, the bug is in your contract's `isSolved(player)` — the backend just relays.

## Updating

```bash
ssh root@your-vps
cd ctf-blockchain-infra && git pull
sudo bash deploy/install.sh        # idempotent — preserves .env and challenges.json
sudo systemctl restart ctf-backend
```

## Rolling back

`install.sh` doesn't snapshot. Use git:

```bash
cd ctf-blockchain-infra
git checkout <previous-sha>
sudo bash deploy/install.sh
sudo systemctl restart ctf-backend
```

`.env` and `challenges.json` are not overwritten by re-install.
