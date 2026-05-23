# @ctf-blockchain-infra/sdk

Zero-dependency wrapper around the [ctf-blockchain-infra](..) HTTP API
for player-side exploit scripts. One ESM file, ~150 lines.

## Why

Every solver script does the same thing:

1. `fetch(BACKEND/api/sign/...)`
2. swallow JSON, throw on non-200
3. `fetch(BACKEND/api/flag/..)` in a poll loop
4. parse `{ solved, flag }`

This SDK collapses that to two lines.

## Install

```bash
npm i ethers                                # optional, only needed for writeup signing
# either:
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
# and import from sdk/index.js in your fork...
```

Or copy `sdk/index.js` into your exploit dir directly — it has no deps.

## Quick start

```js
import { ethers } from "ethers";
import { Ctf } from "ctf-blockchain-infra/sdk";          // or "../../sdk/index.js"

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet   = new ethers.Wallet(process.env.PLAYER_KEY, provider);

const ctf = new Ctf({
  backend:   process.env.BACKEND,
  challenge: "sigreplay",
  player:    wallet.address,
});

// 1. backend mints us a signature
const { signature } = await ctf.getSignature();

// 2. ...do exploit with `signature`...
// const pool = new ethers.Contract(POOL, ABI, wallet);
// for (let i = 0; i < 10; i++) await (await pool.withdraw(...)).wait();

// 3. poll /api/flag until released
const { flag } = await ctf.claimFlag({ poll: 5 });
console.log("flag:", flag);
```

## Reference

| Method | Endpoint | Notes |
|---|---|---|
| `config()` | `GET /api/config` | site + challenges metadata |
| `health()` | `GET /api/health` | liveness |
| `scoreboard()` | `GET /api/scoreboard` | public solve aggregates |
| `getStatus()` | `GET /api/status/:id?address=` | `{solved, spawned, instance?}` |
| `getInstance()` | `GET /api/instance/:id?address=` | private-anvil only |
| `getSignature()` | `GET /api/sign/:id?address=` | personal-sign or eip712 — backend's choice per manifest |
| `spawn()` | `POST /api/launch/:id?address=` | private-anvil only |
| `kill()` | `POST /api/kill/:id?address=` | private-anvil only |
| `reset()` | `POST /api/reset/:id?address=` | private-anvil only — sub-second revert |
| `claimFlag({poll, intervalMs})` | `GET /api/flag/:id?address=` | optionally polls until solved |
| `submitWriteup(text, {signWith})` | `POST /api/writeup/:id?address=` | wraps the canonical signature path if `signWith` is set |

All methods throw `CtfApiError` (carries `.status` and the parsed
`error` string from the backend) on non-2xx.

## Private-anvil example

```js
import { ethers } from "ethers";
import { Ctf } from "../../sdk/index.js";

const me  = new ethers.Wallet(process.env.PLAYER_KEY);
const ctf = new Ctf({ backend: process.env.BACKEND, challenge: "oracle", player: me.address });

// 1. ask the backend to spawn a private anvil
const { instance } = await ctf.spawn();
console.log("RPC URL:", instance.rpcUrl);
console.log("Target: ", instance.target);
console.log("Extras: ", instance.extra);

// 2. drive the bug on the player's private chain
const provider = new ethers.JsonRpcProvider(instance.rpcUrl);
const wallet   = me.connect(provider);
// ...exploit txs against instance.target...

// 3. claim
const { flag } = await ctf.claimFlag({ poll: 10 });
```

If you brick the chain trying something out, `await ctf.reset()` reverts
to the snapshot the launcher took immediately after deploy — much faster
than `kill()` + `spawn()`.

## Custom `fetch`

Pass `fetch:` if you're in an environment where `globalThis.fetch`
isn't available, or you want to wrap with retries / metrics / a proxy:

```js
import { Ctf } from "../../sdk/index.js";
const myFetch = async (url, opts) => { /* ... */ };
const ctf = new Ctf({ backend, challenge, player, fetch: myFetch });
```

## License

MIT.
