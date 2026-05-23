# Scoreboard webhook

Out-of-band notification when a player's solve state changes. The
backend POSTs a small JSON event to a URL you configure — wire it into
CTFd, GZCTF, Slack, Discord, your own scoring service.

## Enable

```ini
# backend/.env
WEBHOOK_URL=https://scoreboard.example.com/api/ctf-hooks
WEBHOOK_SECRET=long_random_string   # optional but recommended
```

Restart the backend. The startup banner now shows `webhook: enabled`.

## Events

| Event | When |
|---|---|
| `solve.first` | The first time the backend observes `isSolved(player) == true` for a (challenge, player) pair. |
| `solve.flip`  | A subsequent change in either direction. For KOTH challenges, `true → false` fires when the player is dethroned. |

Both events share a shape:

```json
{
  "event": "solve.first",
  "timestamp": 1716480000,
  "challenge": "ch01",
  "player": "0xAbC1234567890abcDEF1234567890ABCdef123456",
  "solved": true,
  "previous": null
}
```

`previous` is `null` for `solve.first` and the prior boolean for
`solve.flip`.

## Signature verification

When `WEBHOOK_SECRET` is set, every request carries:

```
X-CTF-Signature: sha256=<hex>
```

…where `<hex>` is `HMAC-SHA256(secret, raw_request_body)`. Verify it
before trusting the payload. Node example:

```js
import crypto from "node:crypto";

function verify(req, secret) {
  const sig = req.headers["x-ctf-signature"]?.split("=")[1];
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

## How it triggers

Two paths:

1. **API-call observation.** Every `/api/status` and `/api/flag` call
   records the player's current state. A state change vs. the previous
   recorded state fires a webhook synchronously.
2. **Background poller.** Every `WEBHOOK_POLL_INTERVAL_MS` (default 30s),
   the tracker re-checks every (challenge, player) pair it's seen
   recently. A KOTH dethrone caused by *another* player will show up
   here.

Players are forgotten after `WEBHOOK_FORGET_AFTER_MS` (default 30 min)
of inactivity. If they come back, they get rediscovered on the next API
call.

## Tuning

| Env | Default | Notes |
|---|---|---|
| `WEBHOOK_POLL_INTERVAL_MS` | `30000` | Lower for tighter KOTH leaderboards; higher to save RPC quota. |
| `WEBHOOK_FORGET_AFTER_MS` | `1800000` | How long inactive players stay tracked. |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Outbound HTTP timeout. |

## Failure handling

The webhook fire is best-effort. The backend logs warnings on non-2xx
responses and timeouts but doesn't retry — if your scoreboard goes
down, you lose the events that fired during that window. Implement
idempotency on the receiving end (event = `(event, challenge, player,
solved)` tuple, dedupe by primary key).

## Wiring to common scoreboards

=== "CTFd (custom plugin)"

    Plugins → write a Flask route that receives the JSON, looks up the
    player by wallet address (you'll need a binding table), and awards
    the challenge.

=== "GZCTF"

    GZCTF has a custom-flag plugin model. Implement a webhook receiver
    that flips the player's `isSolved` for the matching challenge by
    submitting the flag string on their behalf.

=== "Slack / Discord"

    Webhook receivers from both services accept the same shape. Map
    `event=solve.first` to a celebratory channel post; ignore
    `solve.flip` (or wire it to a "leaderboard volatility" channel for
    KOTH events).

## Sample receiver

A 30-line Express server that just logs and ACKs:

```js
import express from "express";
import crypto from "node:crypto";

const SECRET = process.env.SECRET;
const app = express();
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.post("/api/ctf-hooks", (req, res) => {
  if (SECRET) {
    const sig = (req.headers["x-ctf-signature"] ?? "").split("=")[1];
    const expected = crypto.createHmac("sha256", SECRET).update(req.rawBody).digest("hex");
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(401).end();
    }
  }
  console.log(req.body);
  res.json({ ok: true });
});

app.listen(3000);
```
