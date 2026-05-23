# Admin endpoints

A bearer-token-gated surface at `/api/admin/*` for the organizer's
day-of operations: inspect what the backend thinks the world looks
like, hot-reload the manifest, drain stuck instances, fire test
webhooks.

## Enable

```ini
# backend/.env
ADMIN_TOKEN=$(openssl rand -hex 32)
```

Restart. With `ADMIN_TOKEN` set, the admin router responds to requests
carrying `Authorization: Bearer <token>`. **Without** `ADMIN_TOKEN`,
every admin path returns `404` — endpoints are invisible to the
internet.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/admin/instances` | List all running launcher instances. |
| `POST` | `/api/admin/instances/:challengeId/:player/kill` | Force-kill one player's instance. |
| `POST` | `/api/admin/instances/kill-all` | Drain every instance. |
| `GET`  | `/api/admin/drain` | Drain mode status (`{on, reason, since}`). |
| `POST` | `/api/admin/drain/on` | Enter drain mode. New private-anvil launches and resets return 503. Body / query: `reason`. |
| `POST` | `/api/admin/drain/off` | Leave drain mode. |
| `GET`  | `/api/admin/solves` | Dump the solve-tracker state. |
| `GET`  | `/api/admin/challenges` | Per-challenge summary (mode, target, signer). |
| `POST` | `/api/admin/manifest/reload` | Re-read `challenges.json` from disk. Adds new entries, removes dropped ones, kills their containers. |
| `POST` | `/api/admin/webhook/test` | Emit a synthetic webhook event for receiver testing. |
| `GET`  | `/api/admin/writeups[?challenge=<id>]` | Dump submitted writeups, optionally filtered. |

## Examples

```bash
TOKEN=$(cat /opt/ctf/backend/.env | sed -n 's/^ADMIN_TOKEN=//p')

# What's running?
curl -s https://ctf.example.com/api/admin/instances \
  -H "Authorization: Bearer $TOKEN" | jq

# Drain stuck instances during a deploy
curl -sX POST https://ctf.example.com/api/admin/instances/kill-all \
  -H "Authorization: Bearer $TOKEN"

# Add a new challenge mid-event
sudo -e /opt/ctf/backend/challenges.json
curl -sX POST https://ctf.example.com/api/admin/manifest/reload \
  -H "Authorization: Bearer $TOKEN" | jq
# → { reloaded: true, added: ["ch5"], removed: [], total: 5 }

# Confirm the webhook receiver is healthy
curl -sX POST https://ctf.example.com/api/admin/webhook/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"solve.first","challenge":"ch01","player":"0xfeedfacedeadbeefcafebabe1234567890abcdef","solved":true}'
```

## Drain mode

When you're about to roll the backend, swap challenge images, or
investigate a misbehaving private-anvil cluster, flip drain on:

```bash
ctf-admin drain on "rolling backend for ch3 hotfix"
```

While drain is on:

- `POST /api/launch/:id` → `503 { error: "drain mode: new launches paused", reason: ... }`
- `POST /api/reset/:id` → `503 { error: "drain mode: resets paused", reason: ... }`
- `GET /api/status/:id` → unchanged (players keep seeing their own state).
- `GET /api/flag/:id` → unchanged (winners still get their flag).
- `/api/rpc/:instanceId` on already-running instances → unchanged.
- `/api/health` and `/metrics` → include `drain.on=true` so external
  uptime checks and Prometheus can branch on it.

Reload manifests, kill stuck containers, run your migration, then:

```bash
ctf-admin drain off
```

The state is in-memory only — a backend restart returns to the
not-drained default, which is usually what you want post-deploy.

## Hot-reload semantics

`POST /api/admin/manifest/reload` is the headline feature:

- **Added challenge** → loaded; `/api/config` immediately reports it.
- **Removed challenge** → dropped; any running private-anvil instances
  for it are killed.
- **Changed `target` on a shared challenge** → the backend swaps the
  ethers contract pointer. In-flight requests against the old address
  may still complete (they were already dispatched).
- **Changed `signer` or `mode`** → likewise replaced.
- **Changed `image` for a private-anvil challenge** → only affects
  *new* spawns; existing instances run the old image until they expire
  or are killed.

If the new manifest fails validation (bad address, missing flag env),
the call returns `500` and the prior manifest stays active. No state
loss on bad edits.

## Locking it down further

`/api/admin/*` is just an Express router — drop a Cloudflare Access
policy in front of `/api/admin/*` if you want SSO / IP allowlists in
addition to the bearer token. The path is stable.
