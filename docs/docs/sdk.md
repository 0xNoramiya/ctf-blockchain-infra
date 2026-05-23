# Solver SDK

`sdk/index.js` is a zero-dependency ESM wrapper around the `/api/*`
endpoints. Players writing exploit scripts use it instead of
hand-rolling `fetch(BACKEND/api/sign/...)` etc.

Inspired by the
[paradigm-ctf-infrastructure](https://github.com/paradigmxyz/paradigm-ctf-infrastructure)
`CTFSolver` pattern but in plain JavaScript and without any base-class
ceremony — exploits stay scripty.

## Install

Either:

```bash
npm i ethers                                # optional, only for writeup signing
git clone https://github.com/0xNoramiya/ctf-blockchain-infra.git
# then `import { Ctf } from "./sdk/index.js"` from your solver
```

Or copy `sdk/index.js` into your exploit directory — it's one file with no deps.

If/when this lands on npm:

```bash
npm i @ctf-blockchain-infra/sdk
# import { Ctf } from "@ctf-blockchain-infra/sdk"
```

## API

```js
import { Ctf } from "../../sdk/index.js";

const ctf = new Ctf({
  backend:   process.env.BACKEND,       // https://ctf.example.com
  challenge: "sigreplay",
  player:    "0xAbC1234567890abcDEF1234567890ABCdef123456",
});
```

| Method | Endpoint | Returns |
|---|---|---|
| `config()` | `GET /api/config` | full manifest |
| `health()` | `GET /api/health` | `{ ok, challenges, launcher, drain }` |
| `scoreboard()` | `GET /api/scoreboard` | `{ generatedAt, board }` |
| `getStatus()` | `GET /api/status/:id?address=` | `{ solved, spawned, instance? }` |
| `getInstance()` | `GET /api/instance/:id?address=` | `{ instance }` |
| `getSignature()` | `GET /api/sign/:id?address=` | `{ signature, ... }` |
| `spawn()` | `POST /api/launch/:id?address=` | `{ instance }` |
| `kill()` | `POST /api/kill/:id?address=` | `{ killed }` |
| `reset()` | `POST /api/reset/:id?address=` | `{ reset }` |
| `claimFlag({poll, intervalMs})` | `GET /api/flag/:id?address=` | `{ solved, flag }` (throws if never released) |
| `submitWriteup(text, {signWith})` | `POST /api/writeup/:id?address=` | `{ accepted, ts, bytes, signed }` |

All methods throw `CtfApiError` (carries `.status` and the parsed
`error` string from the backend) on non-2xx.

## Reference solver

[`examples/signature-replay/solver/solve.js`](https://github.com/0xNoramiya/ctf-blockchain-infra/blob/main/examples/signature-replay/solver/solve.js)
is the canonical proof-of-use:

```js
import { ethers } from "ethers";
import { Ctf } from "../../../sdk/index.js";

const wallet = new ethers.Wallet(process.env.PLAYER_KEY,
  new ethers.JsonRpcProvider(process.env.RPC_URL));

const ctf = new Ctf({
  backend: process.env.BACKEND,
  challenge: "sigreplay",
  player: wallet.address,
});

const { signature } = await ctf.getSignature();
// ... exploit using `signature` ...
const { flag } = await ctf.claimFlag({ poll: 6 });
console.log("flag:", flag);
```

## Solidity base — `CtfChallenge`

For challenge contracts the shared lib ships an abstract base:

```solidity
import {CtfChallenge} from "@infra/CtfChallenge.sol";

contract MyVault is CtfChallenge {
    constructor(address player) CtfChallenge(player) {}

    function _check() internal view override returns (bool) {
        return token.balanceOf(player) >= 1_000 ether;
    }
}
```

It captures the `player` address, enforces the `isSolved(who) ==
(who == player)` invariant, and exposes a one-shot `recordSolve()`
that emits a `Solved` event for off-chain indexers. Optional — every
existing template still works without it; it just removes the boilerplate.
