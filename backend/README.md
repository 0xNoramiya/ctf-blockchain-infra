# backend

Node + ethers. One file. Reads `challenges.json`, gates flags by on-chain `isSolved(player)`, optionally signs authorization receipts.

## Local dev

```bash
cd backend
npm install
cp .env.example .env
cp challenges.example.json challenges.json
# edit both
node server.js
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Public site + challenge metadata. |
| GET | `/api/status/:id?address=` | Calls `isSolved(player)`. Returns `{solved: bool}`. |
| GET | `/api/flag/:id?address=` | Same check; if solved, returns `{solved: true, flag}`. |
| GET | `/api/sign/:id?address=` | Issues a `personal_sign` signature over the configured template. |
| GET | `/api/health` | `{ok: true, challenges: N}`. |

## Manifest schema

See `challenges.example.json`. Per challenge:

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `[a-z0-9_-]{1,32}`. Used to derive env names. |
| `title` | yes | Card heading. |
| `description` | yes | Player-facing brief. `\n` for paragraph breaks. |
| `target` | yes | Address of the contract exposing `isSolved`. |
| `isSolvedFn` | no | Defaults to `"isSolved"`. |
| `info` | no | Array of `{label, value, kind?}` shown as a key/value list. |
| `downloads` | no | Array of `{label, url}`. |
| `signer.enabled` | no | If true, requires `SIGNER_KEY_<ID>` in env. |
| `signer.template` | when signer enabled | Array of `{type, value}`; `"$player"` substitutes the caller. |

## Env vars

See `.env.example`. Naming conventions:

- `FLAG_<ID>` — one per challenge.
- `SIGNER_KEY_<ID>` — one per challenge with `signer.enabled: true`.
