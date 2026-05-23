# Writeups

The backend ships a built-in writeup endpoint: solved players can
attach a short markdown writeup to their solve, organizers pull them
all from a single admin endpoint after the event.

## Why bake this in

Most CTF organizers end up with a half-broken Google Form, a Discord
channel, and a folder of emailed `.md` files. The writeup endpoint is
the smallest possible alternative: solve-gated, append-only, easy to
back up.

## Submitting

The frontend grows a textarea + submit button on every challenge card
the player has solved (one submission per address; reload-safe via
localStorage). Optionally tick "sign with wallet" to include a
`personal_sign` proof of ownership.

Submitting from the command line:

```bash
curl -sX POST "https://ctf.example.com/api/writeup/ch01?address=0xPlayer" \
  -H "Content-Type: application/json" \
  -d '{"writeup": "# Replay Receipt\n\nThe signer issues without a nonce.\n..."}'
```

## Signed submissions

Setting `WRITEUP_REQUIRE_SIGNATURE=true` forces every submission to
carry a fresh wallet signature. The signed canonical message is:

```
ctf-writeup
<challengeId>
<player>
<timestamp_ms>
<keccak256(utf8(writeup))>
```

The backend `verifyMessage(msg, signature) === player` and rejects
timestamps further than `WRITEUP_SIG_SKEW_MS` (default 5 minutes) from
`Date.now()`. The `signed: true|false` flag is recorded in the JSONL.

Mixed mode (the default): signature optional, but verified when
present. Strict mode (`WRITEUP_REQUIRE_SIGNATURE=true`): always
required.

Or from a browser console after solving:

```js
await fetch("/api/writeup/ch01?address=" + me, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ writeup: "# How I solved it\n..." }),
}).then(r => r.json());
// → { accepted: true, ts, bytes }
```

Limits:

- Hard cap on writeup size (default 4096 bytes UTF-8). Override via
  `WRITEUP_MAX_BYTES`. Surface via `GET /api/writeup/limits`.
- Per-IP rate limit (default 3 submissions / 60s). Override via
  `RATE_LIMIT_WRITEUP`.
- Gated by **on-chain isSolved(player)** — randos can't write to the
  file.

## Storage

Append-only JSONL at `WRITEUPS_PATH` (default `/var/lib/ctf/writeups.jsonl`).
One JSON object per line:

```json
{"ts":"2026-05-23T07:12:01.234Z","challenge":"ch01","player":"0xAbC...","writeup":"# how I did it ...","ip":"203.0.113.1"}
```

Back it up the same way you back up the launcher's instance-state file
(same volume in the bundled compose setup).

## Reading

```bash
ctf-admin writeups            # everything
ctf-admin writeups ch01       # just one challenge
ctf-admin writeups --json | jq # pipeline-friendly
```

Or the raw API:

```bash
curl -s "$BACKEND/api/admin/writeups?challenge=ch01" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

## Publishing them after the event

Turn the JSONL into a static markdown directory with a one-liner:

```bash
ctf-admin writeups --json \
  | jq -r '.writeups[] | "## \(.challenge) — \(.player) — \(.ts)\n\n\(.writeup)\n\n---\n"' \
  > writeups-public.md
```

Or per-challenge:

```bash
for ch in $(ctf-admin challenges --json | jq -r '.challenges[].id'); do
  ctf-admin writeups "$ch" --json \
    | jq -r '.writeups[] | "## \(.player)\n\n\(.writeup)\n\n---\n"' \
    > "writeups-$ch.md"
done
```
