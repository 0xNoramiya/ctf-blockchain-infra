# Secrets

What's sensitive, where it lives, and what happens if you lose it.

## Inventory

| Secret | Lives at | Sensitivity | Worst case if leaked |
|---|---|---|---|
| **Flag strings** (`FLAG_<ID>`) | `/opt/ctf/backend/.env` | High | First-blood theft, scoreboard pollution. Rotate flags + restart. |
| **Backend signer key** (`SIGNER_KEY_<ID>`) | `/opt/ctf/backend/.env` | High | Anyone can mint signatures the contract trusts. Rotate the key, redeploy contract with new signer address, update env. |
| **Deployer key** (`DEPLOYER_KEY`) | Wherever you run `forge script` from | Medium | Anyone can deploy contracts under that address and drain its testnet ETH. Fund with the minimum needed. |
| **Cloudflare API token** (if you use one) | Local dev machine | Medium | Anyone can edit DNS for your zone. Scope tokens to a single zone, expire them after launch. |

## Practical hygiene

- **Use a separate burner wallet for the signer.** Don't reuse the deployer key.
- **Generate signer keys per challenge.** `cast wallet new` is one line. If one challenge's key leaks mid-event, the blast radius is just that challenge.
- **Never commit `.env`** to the repo. `.gitignore` already lists it.
- **Don't echo flags to logs.** The backend only logs status checks, not flag content. If you extend `server.js`, keep that property.
- **Don't put flags in `challenges.json`.** That file is read by the public `/api/config` endpoint (minus secrets). Flags live in `.env` only, keyed by challenge ID.

## Rotation procedure

If a flag is suspected leaked:

```bash
# 1. Generate a new flag value.
NEW="CTF{rotated_$(openssl rand -hex 8)}"

# 2. Edit /opt/ctf/backend/.env, replace FLAG_CH01=...
sudo -e /opt/ctf/backend/.env

# 3. Restart so the new value is read into the process environment.
sudo systemctl restart ctf-backend
```

The contract doesn't care — the flag isn't on-chain.

If a signer key is suspected leaked:

```bash
# 1. Generate a new key + address.
NEW=$(cast wallet new)
# 2. Redeploy the challenge contract with the new signer address baked in.
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast
# 3. Update backend/.env SIGNER_KEY_CH01 and backend/challenges.json target.
sudo -e /opt/ctf/backend/.env
sudo -e /opt/ctf/backend/challenges.json
# 4. Restart.
sudo systemctl restart ctf-backend
```

Player progress on the old contract is now stranded. Decide whether to credit early solvers manually before flipping.

## Hardening file perms

`install.sh` sets `.env` to `chmod 600 root:root` on each run. To verify:

```bash
ls -l /opt/ctf/backend/.env
# expect: -rw------- 1 root root … .env
```

If perms drift (e.g. someone copied the file with `cp -p`), fix:

```bash
sudo chown root:root /opt/ctf/backend/.env
sudo chmod 600 /opt/ctf/backend/.env
```

## What about HSMs / KMS?

For a CTF event this is overkill. The threat model is "one of the players gets RCE on the box" — which already means flag theft regardless of where the signer key lives. Use a burner key, treat the box as disposable, and rotate everything at event end.
