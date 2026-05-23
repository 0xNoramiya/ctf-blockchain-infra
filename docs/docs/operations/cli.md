# ctf-admin CLI

`bin/ctf-admin` is a single-file Node script that wraps `/api/admin/*`
for organizer scripting. No installation step — it speaks `fetch` and
nothing else.

## Setup

```bash
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
cd ctf-blockchain-infra

# Pick up BACKEND + ADMIN_TOKEN from a local .env (the CLI loads them
# automatically when run from the repo root), or set explicitly:
export BACKEND=https://ctf.example.com
export ADMIN_TOKEN=$(grep '^ADMIN_TOKEN=' /opt/ctf/backend/.env | cut -d= -f2)

./bin/ctf-admin help
```

Symlink it into your `$PATH` for global use:

```bash
sudo ln -s "$(pwd)/bin/ctf-admin" /usr/local/bin/ctf-admin
```

## Subcommands

| Command | Purpose |
|---|---|
| `health` | Backend liveness. |
| `metrics` | Raw Prometheus exposition. |
| `config` | `/api/config` — same payload the UI loads. |
| `instances` | List active private-anvil instances. |
| `kill <challenge> <player>` | Stop one player's container. |
| `kill-all` | Drain every running instance. |
| `solves` | Dump the in-memory solve tracker. |
| `challenges` | Per-challenge summary. |
| `reload` | Re-read `challenges.json` from disk and reconcile. |
| `smoke <event> <challenge> <player> [solved]` | Send a synthetic webhook event. |
| `smoke-solve <challenge>` | Run the bundled example solver end-to-end. Generates a throwaway burner, funds it from `FAUCET_KEY` (auto-defaults to anvil's deployer when `chainId=31337`), transfers any ERC20 the recipe declares, execs the solver, asserts the flag came back. |
| `smoke-solve list` | List discovered smoke recipes (one per `examples/<dir>/.ctf-smoke.json`). |
| `status <challenge> <player>` | Same call the UI polls. |
| `flag <challenge> <player>` | Test the flag-gating path. |
| `sign <challenge> <player>` | Mint a backend signature (replay for testing). |

Pass `--json` to any command to get raw JSON for piping into `jq`.

## Common recipes

=== "Pre-event smoke test"

    ```bash
    ctf-admin reload                 # confirm manifest loads
    ctf-admin challenges --json | jq '.challenges[] | .id, .mode'
    ctf-admin smoke solve.first ch01 0xdeadbeef...
    ```

=== "Mid-event drain (releasing a node, scheduled maintenance)"

    ```bash
    ctf-admin instances              # see who's affected
    ctf-admin kill-all
    ```

=== "After hot-loading a new challenge"

    ```bash
    sudo -e /opt/ctf/backend/challenges.json
    ctf-admin reload
    ctf-admin challenges | grep newch
    ```

=== "Auditing solves at event end"

    ```bash
    ctf-admin solves --json > solves-$(date +%F).json
    jq 'group_by(.challengeId) | map({ chal: .[0].challengeId, count: length, solved: map(select(.solved)) | length })' \
       < solves-*.json
    ```

## Locking down

The CLI requires the bearer token via `ADMIN_TOKEN`. The backend's
admin router returns `404` when the env var is unset on its side — even
the token-bearer can't reach endpoints that don't exist. Pair with:

- Cloudflare Access policy on `/api/admin/*`.
- A separate VPS for the operator's shell rather than running from
  laptops.
- Token rotation at event end (`openssl rand -hex 32`, edit `.env`,
  `systemctl restart ctf-backend`).
