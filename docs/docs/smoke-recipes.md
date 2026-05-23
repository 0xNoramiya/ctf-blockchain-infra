# Smoke recipes

A **smoke recipe** declares how `ctf-admin smoke-solve <challenge>`
runs the matching example solver against a live backend. One JSON file
per example, dropped at `examples/<dir>/.ctf-smoke.json`.

`ctf-admin` discovers recipes by scanning the directory at startup;
there's no central registry. To register a new challenge for smoke
testing, drop a recipe next to its solver.

## Schema

```json
{
  "spec": "ctf-smoke/v1",
  "challengeId": "kothfk",
  "fromInfo":   { "BANK": "Bank", "TOKEN": "Token" },
  "extra":      { "BUMP_AMOUNT": "100" },
  "fundTokens": { "Token": "200000000000000000000" }
}
```

| Field | Required | Notes |
|---|---|---|
| `spec` | yes | Always `"ctf-smoke/v1"`. Future-incompatible shapes will bump. |
| `challengeId` | yes | Must match the `id` of an entry in `challenges.json` on the backend. |
| `fromInfo` | optional | Object whose values are labels in `/api/config[].info[]`; the matching `value` is exposed to the solver as an env var named by the key. Use this to pump deployed contract addresses into the solver. |
| `extra` | optional | Literal env additions for the solver (e.g. `BUMP_AMOUNT`). |
| `fundTokens` | optional | `{ infoLabel: amount-in-wei }` — pre-transfers ERC20 balances from the funding wallet to the burner before invoking the solver. |

## Invocation

```bash
ctf-admin smoke-solve sigreplay        # one-shot
ctf-admin smoke-solve list             # show every discovered recipe
ctf-admin smoke-solve unknown          # → helpful error listing what's available
```

The runner:

1. Loads the recipe from the file.
2. Calls `/api/config` to find the challenge entry; fails loudly if it's missing.
3. Creates a fresh `ethers.Wallet.createRandom()` burner.
4. Funds it with `SMOKE_FUNDING_ETH` (default `0.05` ETH) from
   `FAUCET_KEY` / `SMOKE_FUNDING_KEY`. When `chainId == 31337` and
   neither is set, falls back to anvil's deployer key automatically.
5. Walks `fundTokens` — for each label, looks up the address in
   `/api/config[].info[]`, transfers the configured amount from the
   funder to the burner.
6. Resolves `fromInfo` into solver env vars.
7. Adds the `extra` entries verbatim.
8. `exec`s `examples/<dir>/solver/solve.js` with `PLAYER_KEY`,
   `BACKEND`, `CHALLENGE`, `RPC_URL`, plus the above. Asserts exit 0.

## Authoring a new recipe

1. Drop `examples/your-example/.ctf-smoke.json`.
2. Set `challengeId` to the manifest id you'll publish to players.
3. List the address labels your solver needs in `fromInfo`. The labels
   must match the `label` fields in `challenges.json.info[]` exactly.
4. If players need ERC20 balances pre-loaded, declare them in
   `fundTokens`. The funder must already hold the tokens.
5. Run `ctf-admin smoke-solve list` — your new recipe shows up.
6. Run `ctf-admin smoke-solve <id>` — should print the flag and exit 0.

## Private-anvil shape

For private-anvil challenges the recipe stays small — the solver calls
`ctf.spawn()` itself and reads `instance.extra` for per-instance
addresses. The recipe just needs:

```json
{
  "spec": "ctf-smoke/v1",
  "challengeId": "oracle",
  "fromInfo": {}
}
```

The bundled `examples/oracle-manipulation/.ctf-smoke.json` shows this
pattern.
