# FAQ

## Why testnet and not a local chain?

Two reasons. Players want to interact with their existing wallets and tools. And testnet state is public — it's a verifier you can't fake. If you ran a local anvil, players would have to trust your screenshot of `isSolved → true`. On Sepolia, anyone can check.

## Why no database?

All challenge state is on-chain. There's nothing to persist. Restarts are free; rebuilds are free; rollbacks are `git checkout`.

If you want a scoreboard, plug a third-party scoreboard (CTFd, GZCTF) at the front and use this stack as a flag oracle. They call your `/api/flag/:id?address=` endpoint, you return the flag, they award points.

## Can I host more than two challenges?

Yes. Add as many entries as you want to `challenges.json`. Each one needs:

- A unique `id`.
- A deployed contract with `isSolved(address)`.
- A `FLAG_<ID>` in `.env`.
- Optionally a `SIGNER_KEY_<ID>` if `signer.enabled`.

## Why the backend at all? Why not pure frontend?

The flag has to come from somewhere a player can't read directly. The backend is that gate. It does almost nothing else.

If you remove the backend, the flag would have to ship in the bundle the player downloads — there's no way to gate that on-chain without an oracle, which would be more infrastructure than just running a tiny Node server.

## Can a player ever get a flag without solving on-chain?

Not through any documented path. The flag endpoint always calls the contract first:

```js
const ok = await ch.contract[ch.isSolvedFn](player);
if (!ok) return res.json({ solved: false });
res.json({ solved: true, flag: ch.flag });
```

The only attack surface is your `isSolved()` itself — see [unintended paths](challenges/overview.md#unintended-paths).

## Does the player's wallet need to send the request?

No. The frontend only sends the address — no signature, no transaction. That's by design: anyone (including bystanders, scoreboard pollers, or your monitoring) can check `isSolved(player)` for any player address. The check is on-chain state. There's no privacy here.

If you wanted to gate the flag on a wallet-proven request (signed challenge string, SIWE), you could add it. For a public CTF, it's not standard.

## What stops a player from racing the backend?

Nothing — that's the design. Once a player's on-chain state satisfies `isSolved`, any number of people can hit `/api/flag/:id?address=PLAYER` and get the flag. In practice this matters for scoreboards: first-blood goes to whoever submits first, not whoever solved first on-chain. If you care, run a CTF platform out front and ignore the backend's `/api/flag` for scoring — use `/api/status` and award based on solve time.

## How do I add a brand / theme?

Edit `frontend/style.css`. The light theme uses CSS variables — `--bg`, `--surface`, `--accent`, `--text`. A full restyle is usually one file.

## Can I use this with mainnet?

You can, but please don't. Mainnet gas costs make per-player factories prohibitive, and any bug in a deployed contract is a real-money bug. Sepolia, Holesky, Base Sepolia, Optimism Sepolia, Arbitrum Sepolia all work. Set `RPC_URL` + `CHAIN_ID` accordingly.

## How do I update the frontend without a restart?

You don't need to. nginx serves the static files directly. Edit them in place and refresh the browser:

```bash
sudo -e /opt/ctf/frontend/style.css
```

Only `server.js`, `.env`, and `challenges.json` require `systemctl restart ctf-backend`.

## How do I add EIP-712 signatures?

Built in. Set `signer.type: "eip712"` on the challenge and provide a `typedData` block with `domain`, `types`, `primaryType`, and `message`. Use `"$player"` anywhere in `message` to substitute the requesting wallet, and `"$chainId"` in `domain.chainId` to substitute the configured chain. See `backend/challenges.example.json` for a working permit-style example.

## Is there CI?

A docs workflow ships in `.github/workflows/docs.yml`. Add forge / lint workflows to taste — Foundry has good GitHub Actions templates.
