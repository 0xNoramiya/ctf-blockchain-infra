# Challenge packs

A **pack** is a portable bundle for one challenge. Think of it as the
"`brew install <package>`" experience for CTF problems.

Templates are skeletons. [Worked examples](examples.md) are full
implementations. Packs are the *deliverable* you hand to another
organizer so they can drop your challenge into their event in one
command.

## When to use what

| You want… | Use… |
|---|---|
| A starting point to write a NEW bug pattern | `contracts-template/` |
| To learn the wire-up by reading complete code | `examples/` |
| To ship a challenge to a friend's CTF | `packs/` |

## Layout

```
mypack/
├── pack.yaml          — metadata + install hints
├── manifest.json      — challenges.json entry with placeholders
├── dist/              — files staged into <frontend>/dist/<id>/
├── README.md          — pack notes (optional)
└── image/             — optional private-anvil build context
```

## pack.yaml

```yaml
spec: ctf-pack/v1
id: sigreplay
title: Replay Receipt
mode: shared

install:
  resolveFields:
    - target

requires:
  env:
    - FLAG_SIGREPLAY
    - SIGNER_KEY_SIGREPLAY

notes: |
  Two env vars required. Deploy the contracts first, then pass
  --target=<pool-address> to `ctf-admin install-pack`.
```

`install.resolveFields` declares which placeholder substitutions the
pack expects at install time. Allowed fields: `target`, `image`,
`fork.url`, `fork.blockNumber`. Each maps to a `--<field>` CLI flag
and a `$INSTALL_<FIELD>` placeholder in `manifest.json`.

## Installing a pack

```bash
ctf-admin install-pack ./mypack \
  --target 0xDeployedAddr \
  --packs-dir /opt/ctf/backend/packs \
  --frontend-dist /opt/ctf/frontend/dist
```

What the command does:

1. Reads `pack.yaml`, validates `spec` and `id`.
2. Substitutes `$INSTALL_TARGET`, `$INSTALL_IMAGE`, etc. in
   `manifest.json` using the CLI flags.
3. Writes the resolved entry to `<packs-dir>/<id>.json`.
4. Copies `dist/*` into `<frontend-dist>/<id>/`.
5. Prints the required env vars and the splice/reload command.

## Splicing into your main manifest

The CLI keeps the pack's entry as a separate file so you can audit
the diff before it goes live. To wire it in:

```bash
jq '.challenges += [input] | .challenges |= unique_by(.id)' \
   /opt/ctf/backend/challenges.json \
   /opt/ctf/backend/packs/mypack.json \
   > /tmp/merged.json \
&& sudo mv /tmp/merged.json /opt/ctf/backend/challenges.json \
&& ctf-admin reload
```

`unique_by(.id)` de-duplicates if you've installed the pack before.

## Authoring a pack

Copy `packs/example-sigreplay/` and edit:

- `pack.yaml`: bump the id, title, declare `resolveFields` + `requires.env`.
- `manifest.json`: write the entry players will see, with placeholders.
- `dist/`: drop in the contracts zip (and anything else players download).
- `image/`: optional, build context for the private-anvil image.

The bar for a publishable pack is the same as for an [example](examples.md):
real bug pattern with an audit citation; forge tests proving it works;
short, opinionated README.

## Distributing a pack

Tar it up. There's no central registry yet — distribute via git, S3,
Slack DMs, whatever you'd use for a Helm chart. A future iteration may
add `ctf-admin install-pack <url>` for HTTPS fetch + checksum
verification.
