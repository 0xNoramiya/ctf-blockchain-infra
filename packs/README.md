# Challenge packs

A **pack** is a portable bundle that captures everything needed to add
one challenge to a deployment. Think of it as the
"`brew install <package>`" experience for CTF challenges.

## Why a pack format?

Templates are skeletons. Examples are walkthroughs. Neither answers
"how do I drop a challenge a friend wrote into my live event?". Packs
do — one directory, one command.

## Layout

```
mypack/
├── pack.yaml          — metadata + install hints
├── manifest.json      — challenges.json entry with placeholders
├── dist/              — files staged into <frontend>/dist/<id>/
├── README.md          — pack notes (optional)
└── image/             — optional private-anvil build context
    ├── Dockerfile
    ├── src/
    └── entrypoint.sh
```

## Install

```bash
ctf-admin install-pack ./mypack \
  --target 0xDeployedAddr \
  --packs-dir /opt/ctf/backend/packs \
  --frontend-dist /opt/ctf/frontend/dist
```

What happens:

1. Reads `pack.yaml` to discover the id, resolve-fields, and required env vars.
2. Substitutes placeholders (`$INSTALL_TARGET`, `$INSTALL_IMAGE`, etc.)
   in `manifest.json`.
3. Writes the resolved manifest to `<packs-dir>/<id>.json`.
4. Copies `dist/*` to `<frontend-dist>/<id>/`.
5. Prints next steps (env vars to set, reload command).

## Wiring a pack into your manifest

A pack's resolved entry lives in its own file under `packs-dir/`. To
reference it from the main `challenges.json`, splice it in:

```bash
jq '.challenges += [input]' \
   /opt/ctf/backend/challenges.json \
   /opt/ctf/backend/packs/mypack.json \
   > /tmp/merged.json \
&& sudo mv /tmp/merged.json /opt/ctf/backend/challenges.json

ctf-admin reload
```

(A future version of the CLI will do the splice for you. For now, this
two-line shell pattern is the safe, idempotent approach — `jq` doesn't
duplicate the entry if it's already present, if you add a `unique_by(.id)`.)

## Placeholders

| Placeholder | Filled by | Where it can appear |
|---|---|---|
| `$INSTALL_TARGET` | `--target` | Anywhere a string is expected (typically `target`). |
| `$INSTALL_IMAGE` | `--image` | `image` field for private-anvil packs. |
| `$INSTALL_FORK_URL` | `--fork-url` | `fork.url` |
| `$INSTALL_FORK_BLOCK` | `--fork-block-number` (number) | `fork.blockNumber` |

Any placeholder declared in `install.resolveFields` MUST be supplied at
install time; missing values fail fast.

## Example

The bundled [`example-sigreplay/`](./example-sigreplay) pack mirrors
the signature-replay worked example. After deploying the contracts:

```bash
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast
# Pool: 0xabc...
ctf-admin install-pack packs/example-sigreplay --target 0xabc...
```
